import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MongoServerError } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';
const MAX_CALLBACK_AGE_MS = 5 * 60 * 1000;

function plainText(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const timestamp = params.get('timestamp') ?? '';
  const eventId = params.get('eventId') ?? '';
  const userId = params.get('userId') ?? params.get('userid') ?? '';
  const rewards = params.get('rewards') ?? '';
  const signature = params.get('signature')?.toLowerCase() ?? '';
  const appKey = params.get('appKey') ?? '';
  const privateKey = process.env.LEVELPLAY_S2S_PRIVATE_KEY ?? '';
  const expectedAppKey = process.env.LEVELPLAY_APP_KEY ?? '';
  const configuredReward = Number(process.env.LEVELPLAY_REWARD_COINS);
  const timestampValue = Number(timestamp);
  const timestampMs = timestampValue < 10_000_000_000 ? timestampValue * 1000 : timestampValue;

  if (privateKey.length < 32 || !expectedAppKey || !Number.isSafeInteger(configuredReward) || configuredReward <= 0) {
    return plainText('LevelPlay callback is not configured.', 503);
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId) || !/^[a-f0-9]{64}$/.test(userId) || appKey !== expectedAppKey) {
    return plainText('Invalid callback parameters.', 400);
  }
  if (!Number.isSafeInteger(timestampValue) || Math.abs(Date.now() - timestampMs) > MAX_CALLBACK_AGE_MS) {
    return plainText('Expired callback.', 403);
  }
  const rewardAmount = Number(rewards);
  if (!Number.isSafeInteger(rewardAmount) || rewardAmount !== configuredReward) return plainText('Invalid reward amount.', 400);

  const expected = createHash('md5').update(`${timestamp}${eventId}${userId}${rewards}${privateKey}`).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const signatureBytes = /^[a-f0-9]{32}$/.test(signature) ? Buffer.from(signature, 'hex') : Buffer.alloc(0);
  if (signatureBytes.length !== expectedBytes.length || !timingSafeEqual(signatureBytes, expectedBytes)) {
    return plainText('Invalid signature.', 403);
  }

  const db = await getDb();
  const session = db.client.startSession();
  const operationId = `levelplay:${eventId}`;
  try {
    await session.withTransaction(async () => {
      const user = await db.collection<{ _id: string; levelPlayUserId?: string; disabled?: boolean; coins?: number }>('users').findOneAndUpdate(
        { levelPlayUserId: userId, disabled: { $ne: true } },
        { $inc: { coins: rewardAmount } },
        { session, returnDocument: 'after' },
      );
      if (!user) throw new Error('Reward user not found.');
      await db.collection<{ _id: string; userId: string; kind: string; createdAt: Date }>('coin-operations').insertOne(
        { _id: operationId, userId: user._id, kind: 'levelplay-reward', createdAt: new Date() },
        { session },
      );
      await db.collection<{ _id: string; userId: string; type: string; amount: number; description: string; createdAt: Date }>('coin-transactions').insertOne(
        { _id: operationId, userId: user._id, type: 'ad_reward', amount: rewardAmount, description: 'LevelPlay rewarded ad', createdAt: new Date() },
        { session },
      );
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) return plainText('Reward processing failed.', 500);
  } finally {
    await session.endSession();
  }
  return plainText(`<status>${eventId}:OK</status>`);
}
