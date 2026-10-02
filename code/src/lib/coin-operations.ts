import 'server-only';

import { randomBytes } from 'node:crypto';
import { MongoServerError, type ClientSession, type Db, type Document } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { getQueryById } from '@/lib/actions/utils';

type OperationResult = {
  success: boolean;
  error?: string;
  coins?: number;
  reward?: number;
  dayNum?: number;
  coinsAwarded?: number;
  bonusCoins?: number;
  message?: string;
};

class CoinOperationError extends Error {}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function positiveInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function runTransaction<T>(work: (db: Db, session: ClientSession) => Promise<T>): Promise<T> {
  const db = await getDb();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(
      () => work(db, session),
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }
}

async function reserveOperation(
  db: Db,
  session: ClientSession,
  operationId: string,
  userId: string,
  kind: string,
): Promise<void> {
  await db.collection<{ _id: string; userId: string; kind: string; createdAt: Date }>('coin-operations').insertOne(
    { _id: operationId, userId, kind, createdAt: new Date() },
    { session },
  );
}

async function writeLedger(
  db: Db,
  session: ClientSession,
  entry: { operationId: string; userId: string; type: string; amount: number; description: string },
): Promise<void> {
  await db.collection<{ _id: string; userId: string; type: string; amount: number; description: string; createdAt: Date }>(
    'coin-transactions',
  ).insertOne(
    {
      _id: entry.operationId,
      userId: entry.userId,
      type: entry.type,
      amount: entry.amount,
      description: entry.description,
      createdAt: new Date(),
    },
    { session },
  );
}

export async function claimReward(
  userId: string,
  taskId: string,
  platform: 'website' | 'android',
  challengeToken: string,
): Promise<OperationResult> {
  const db = await getDb();
  const task = await db.collection('reward-tasks').findOne(getQueryById(taskId));
  if (!task || task.isActive === false) return { success: false, error: 'Task not found' };
  if ((task.platform || 'website') !== platform) {
    return { success: false, error: 'Reward task is not available on this platform' };
  }
  if (task.type === 'ad') {
    return { success: false, error: 'Rewarded-ad verification is not configured' };
  }

  const amount = positiveInteger(task.coins);
  if (!amount) return { success: false, error: 'Reward configuration is invalid' };
  const period = task.frequency === 'once' ? 'once' : new Date().toISOString().slice(0, 10);
  const operationId = `reward:${platform}:${taskId}:${period}:${userId}`;

  try {
    return await runTransaction(async (transactionDb, session) => {
      const now = new Date();
      const challenge = await transactionDb.collection<{
        _id: string;
        userId: string;
        taskId: string;
        platform: string;
        eligibleAt: Date;
        expiresAt: Date;
        usedAt?: Date;
      }>('reward-challenges').findOneAndUpdate(
        {
          _id: challengeToken,
          userId,
          taskId,
          platform,
          eligibleAt: { $lte: now },
          expiresAt: { $gt: now },
          usedAt: { $exists: false },
        },
        { $set: { usedAt: now } },
        { returnDocument: 'after', session },
      );
      if (!challenge) throw new CoinOperationError('Reward challenge is invalid or not yet eligible');
      await reserveOperation(transactionDb, session, operationId, userId, 'reward');
      const user = await transactionDb.collection<{ _id: string; coins?: number }>('users').findOneAndUpdate(
        { _id: userId, disabled: { $ne: true } },
        { $inc: { coins: amount } },
        { returnDocument: 'after', session },
      );
      if (!user) throw new CoinOperationError('User not found');

      await transactionDb.collection('reward-claims').insertOne(
        { operationId, userId, taskId, platform, claimedAt: new Date() },
        { session },
      );
      await writeLedger(transactionDb, session, {
        operationId,
        userId,
        type: 'reward',
        amount,
        description: `Reward: ${String(task.title || taskId)}`,
      });
      return { success: true, coins: user.coins ?? 0, reward: amount };
    });
  } catch (error) {
    if (isDuplicateKey(error)) return { success: false, error: 'Already claimed' };
    if (error instanceof CoinOperationError) return { success: false, error: error.message };
    throw error;
  }
}

export async function startRewardClaim(
  userId: string,
  taskId: string,
  platform: 'website' | 'android',
): Promise<OperationResult & { challengeToken?: string; eligibleAt?: string }> {
  const db = await getDb();
  const task = await db.collection('reward-tasks').findOne(getQueryById(taskId));
  if (!task || task.isActive === false) return { success: false, error: 'Task not found' };
  if ((task.platform || 'website') !== platform) {
    return { success: false, error: 'Reward task is not available on this platform' };
  }
  if (task.type === 'ad') {
    return { success: false, error: 'Rewarded-ad verification is not configured' };
  }

  const period = task.frequency === 'once' ? 'once' : new Date().toISOString().slice(0, 10);
  const operationId = `reward:${platform}:${taskId}:${period}:${userId}`;
  const existing = await db.collection<{ _id: string }>('coin-operations').findOne({ _id: operationId });
  if (existing) return { success: false, error: 'Already claimed' };

  const delaySeconds = Math.min(3600, Math.max(1, positiveInteger(task.timerSeconds, 10)));
  const now = Date.now();
  const eligibleAt = new Date(now + delaySeconds * 1000);
  const expiresAt = new Date(eligibleAt.getTime() + 30 * 60 * 1000);
  const challengeToken = randomBytes(32).toString('hex');
  await db.collection<{
    _id: string;
    userId: string;
    taskId: string;
    platform: string;
    eligibleAt: Date;
    expiresAt: Date;
    createdAt: Date;
  }>('reward-challenges').insertOne({
    _id: challengeToken,
    userId,
    taskId,
    platform,
    eligibleAt,
    expiresAt,
    createdAt: new Date(now),
  });
  return { success: true, challengeToken, eligibleAt: eligibleAt.toISOString() };
}

export async function performDailyCheckIn(userId: string): Promise<OperationResult> {
  const today = new Date().toISOString().slice(0, 10);
  const operationId = `checkin:${today}:${userId}`;

  try {
    return await runTransaction(async (db, session) => {
      await reserveOperation(db, session, operationId, userId, 'daily-checkin');
      const user = await db.collection<{ _id: string; coins?: number; lastCheckInDate?: string; consecutiveCheckInDays?: number }>(
        'users',
      ).findOne({ _id: userId, disabled: { $ne: true } }, { session });
      if (!user) throw new CoinOperationError('User not found');
      if (user.lastCheckInDate === today) throw new CoinOperationError('Already checked in today');

      const settings = await db.collection<{ _id: string; dailyRewards?: unknown[] }>('settings').findOne(
        { _id: 'rewards' },
        { session },
      );
      const configured = Array.isArray(settings?.dailyRewards) ? settings.dailyRewards : [10, 20, 30, 40, 50, 60, 70];
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const dayNum = user.lastCheckInDate === yesterday.toISOString().slice(0, 10)
        ? ((user.consecutiveCheckInDays ?? 0) % 7) + 1
        : 1;
      const reward = positiveInteger(configured[dayNum - 1]);
      if (!reward) throw new CoinOperationError('Daily reward configuration is invalid');

      const updated = await db.collection<{ _id: string; coins?: number }>('users').findOneAndUpdate(
        { _id: userId, lastCheckInDate: { $ne: today } },
        { $inc: { coins: reward }, $set: { lastCheckInDate: today, consecutiveCheckInDays: dayNum } },
        { returnDocument: 'after', session },
      );
      if (!updated) throw new CoinOperationError('Already checked in today');
      await writeLedger(db, session, {
        operationId,
        userId,
        type: 'daily-checkin',
        amount: reward,
        description: `Daily Check-in: Day ${dayNum}`,
      });
      return { success: true, coins: updated.coins ?? 0, reward, dayNum };
    });
  } catch (error) {
    if (isDuplicateKey(error)) return { success: false, error: 'Already checked in today' };
    if (error instanceof CoinOperationError) return { success: false, error: error.message };
    throw error;
  }
}

export async function claimReferralCode(userId: string, referralCodeInput: string): Promise<OperationResult> {
  const cleanCode = referralCodeInput.trim();
  if (!cleanCode) return { success: false, error: 'Referral code is required' };
  const operationId = `referral:${userId}`;

  try {
    return await runTransaction(async (db, session) => {
      await reserveOperation(db, session, operationId, userId, 'referral');
      const users = db.collection<Document & { _id: string }>('users');
      const currentUser = await users.findOne({ _id: userId, disabled: { $ne: true } }, { session });
      if (!currentUser) throw new CoinOperationError('User profile not found');
      if (currentUser.referredBy) throw new CoinOperationError('You have already redeemed a referral code');

      const escapedCode = cleanCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const referrer = await users.findOne(
        { referralCode: { $regex: `^${escapedCode}$`, $options: 'i' }, disabled: { $ne: true } },
        { session },
      );
      if (!referrer) throw new CoinOperationError('Invalid referral code');
      if (referrer._id === userId) throw new CoinOperationError('You cannot use your own referral code');

      const settings = await db.collection<Document & { _id: string }>('settings').findOne(
        { _id: 'general' },
        { session },
      );
      if (settings?.referralEnabled === false) throw new CoinOperationError('Referral program is currently disabled');
      const inviterReward = positiveInteger(settings?.referralRewardCoins, 50);
      const inviteeBonus = positiveInteger(settings?.referredBonusCoins, 50);

      const inviteeUpdate = await users.updateOne(
        { _id: userId, $or: [{ referredBy: { $exists: false } }, { referredBy: null }, { referredBy: '' }] },
        { $inc: { coins: inviteeBonus }, $set: { referredBy: referrer.referralCode || cleanCode } },
        { session },
      );
      if (inviteeUpdate.modifiedCount !== 1) throw new CoinOperationError('You have already redeemed a referral code');
      await users.updateOne(
        { _id: referrer._id },
        { $inc: { coins: inviterReward, referralCount: 1, referralEarnings: inviterReward } },
        { session },
      );

      await writeLedger(db, session, {
        operationId: `${operationId}:invitee`, userId, type: 'referral', amount: inviteeBonus,
        description: `Referral bonus: ${cleanCode}`,
      });
      await writeLedger(db, session, {
        operationId: `${operationId}:inviter`, userId: referrer._id, type: 'referral', amount: inviterReward,
        description: `Referral reward: ${userId}`,
      });
      return {
        success: true,
        coinsAwarded: inviteeBonus,
        bonusCoins: inviteeBonus,
        message: `Referral bonus credited: +${inviteeBonus} coins`,
      };
    });
  } catch (error) {
    if (isDuplicateKey(error)) return { success: false, error: 'You have already redeemed a referral code' };
    if (error instanceof CoinOperationError) return { success: false, error: error.message };
    throw error;
  }
}

export async function unlockEpisodeWithCoins(input: {
  userId: string;
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  cost: number;
  description: string;
}): Promise<OperationResult> {
  const cost = positiveInteger(input.cost);
  if (!cost) return { success: false, error: 'Episode cost is invalid' };
  const operationId = `episode-unlock:${input.userId}:${input.episodeId}`;

  try {
    return await runTransaction(async (db, session) => {
      await reserveOperation(db, session, operationId, input.userId, 'episode-unlock');
      const user = await db.collection<{ _id: string; coins?: number }>('users').findOneAndUpdate(
        { _id: input.userId, disabled: { $ne: true }, coins: { $gte: cost } },
        { $inc: { coins: -cost } },
        { returnDocument: 'after', session },
      );
      if (!user) throw new CoinOperationError('Insufficient coins');

      await db.collection('unlocked-episodes').insertOne(
        {
          operationId,
          userId: input.userId,
          seriesId: input.seriesId,
          episodeId: input.episodeId,
          method: 'coins',
          episodeNumber: input.episodeNumber,
          unlockedAt: new Date(),
        },
        { session },
      );
      await writeLedger(db, session, {
        operationId,
        userId: input.userId,
        type: 'spend',
        amount: -cost,
        description: input.description,
      });
      return { success: true, coins: user.coins ?? 0 };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const db = await getDb();
      const user = await db.collection<{ _id: string; coins?: number }>('users').findOne({ _id: input.userId });
      return { success: true, coins: user?.coins ?? 0 };
    }
    if (error instanceof CoinOperationError) return { success: false, error: error.message };
    throw error;
  }
}
