import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId, type Filter } from 'mongodb';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';
import { unlockEpisodeWithCoins } from '@/lib/coin-operations';

type SeriesDocument = { _id: ObjectId | string; freeEpisodesCount?: number; title?: string };
type UserDocument = { _id: string; coins?: number; isVip?: boolean; vipExpiry?: string | Date };
type EpisodeDocument = { _id: ObjectId | string; seriesId: string; episodeInSeason?: number };

function queryById(id: string): Filter<SeriesDocument> {
  return ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;
    await authenticateFirebaseRequest(request, { targetUid: uid });
    const db = await getDb();
    const body = (await request.json()) as Record<string, unknown>;
    const seriesId = typeof body.seriesId === 'string' ? body.seriesId : '';
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId : '';
    const method = typeof body.method === 'string' ? body.method : '';
    if (!seriesId || !episodeId || !['coins', 'ad'].includes(method)) {
      return NextResponse.json({ error: 'Invalid unlock request' }, { status: 400 });
    }

    const users = db.collection<UserDocument>('users');
    const user = await users.findOne({ _id: uid });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const vipActive = user.isVip === true && (!user.vipExpiry || new Date(user.vipExpiry) > new Date());
    const series = await db.collection<SeriesDocument>('series').findOne(queryById(seriesId));
    const freeCount = Number(series?.freeEpisodesCount ?? 3);
    const episodes = await db.collection<EpisodeDocument>('episodes')
      .find({ seriesId })
      .sort({ episodeInSeason: 1 })
      .toArray();
    const requestedIndex = episodes.findIndex(ep => ep._id.toString() === episodeId);
    if (requestedIndex < 0) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

    const requestedEpisode = episodes[requestedIndex];
    const episodeNumber = Number(requestedEpisode.episodeInSeason || requestedIndex + 1);
    if (vipActive || episodeNumber <= freeCount) {
      return NextResponse.json({ success: true, coins: user.coins ?? 0 });
    }

    const existing = await db.collection('unlocked-episodes').findOne({ userId: uid, episodeId });
    if (existing) return NextResponse.json({ success: true, coins: user.coins ?? 0 });

    if (requestedIndex > 0) {
      const previous = episodes[requestedIndex - 1];
      const previousNumber = Number(previous.episodeInSeason || requestedIndex);
      if (previousNumber > freeCount) {
        const previousUnlocked = await db.collection('unlocked-episodes').findOne({
          userId: uid,
          episodeId: previous._id.toString(),
        });
        if (!previousUnlocked) {
          return NextResponse.json(
            { error: `Unlock episode ${previousNumber} first`, requiredEpisodeNumber: previousNumber },
            { status: 409 },
          );
        }
      }
    }

    if (method === 'coins') {
      const monetization = await db
        .collection<{ _id: string; episodeCost?: number }>('settings')
        .findOne({ _id: 'monetization' });
      const cost = Number(monetization?.episodeCost ?? 10);
      const result = await unlockEpisodeWithCoins({
        userId: uid,
        seriesId,
        episodeId,
        episodeNumber,
        cost,
        description: `Unlocked: ${series?.title || 'Series'} - Ep ${episodeNumber}`,
      });
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, coins: result.coins, todayAdCount: 0 });
    }

    return NextResponse.json(
      { error: 'Rewarded-ad unlocks are disabled until server-side verification is configured' },
      { status: 503 },
    );
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('API POST /api/user/[uid]/unlock Error:', error);
    }
    return NextResponse.json({ error: 'Failed to unlock episode' }, { status: 500 });
  }
}
