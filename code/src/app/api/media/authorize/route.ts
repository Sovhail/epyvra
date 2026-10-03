import { ObjectId } from 'mongodb';
import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';
import { getSecureVideoUrl } from '@/lib/actions';
import { getDb } from '@/lib/mongodb';
import { getMediaClientIp, PremiumMediaConfigurationError, signBunnyMediaUrl } from '@/lib/premium-media';

export const dynamic = 'force-dynamic';

type EpisodeDocument = {
  _id: string | ObjectId;
  seriesId: string;
  episodeInSeason?: number;
  videoSources?: Array<{ quality?: string; url?: string }>;
};

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { episodeId?: unknown; sourceIndex?: unknown };
    const episodeId = typeof body.episodeId === 'string' ? body.episodeId.trim() : '';
    const sourceIndex = typeof body.sourceIndex === 'number' ? body.sourceIndex : 0;
    if (!episodeId || !Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 10) {
      return NextResponse.json({ error: 'Invalid media request' }, { status: 400, headers: noStoreHeaders });
    }

    const db = await getDb();
    const episodeKey = ObjectId.isValid(episodeId) ? new ObjectId(episodeId) : episodeId;
    const episode = await db.collection<EpisodeDocument>('episodes').findOne({ _id: episodeKey });
    if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStoreHeaders });

    const seriesKey = ObjectId.isValid(episode.seriesId) ? new ObjectId(episode.seriesId) : episode.seriesId;
    const series = await db.collection<{ _id: string | ObjectId; freeEpisodesCount?: number }>('series').findOne({ _id: seriesKey });
    if (!series) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStoreHeaders });

    const isPremium = (episode.episodeInSeason ?? 1) > (Number(series.freeEpisodesCount) || 3);
    let uid: string | null = null;
    if (isPremium) {
      uid = (await authenticateFirebaseRequest(request)).uid;
      const user = await db.collection('users').findOne({ _id: uid as never });
      const vipActive = user?.isVip === true && (!user.vipExpiry || new Date(user.vipExpiry).getTime() > Date.now());
      const unlocked = vipActive ? true : Boolean(await db.collection('unlocked-episodes').findOne({
        userId: uid,
        episodeId: episode._id.toString(),
      }));
      if (!unlocked) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: noStoreHeaders });
    }

    const source = episode.videoSources?.[sourceIndex]?.url;
    if (!source) return NextResponse.json({ error: 'Media source unavailable' }, { status: 404, headers: noStoreHeaders });
    if (!isPremium) {
      return NextResponse.json({ url: await getSecureVideoUrl(source), expiresAt: null }, { headers: noStoreHeaders });
    }

    const signed = signBunnyMediaUrl({
      sourceUrl: source,
      episodeId: episode._id.toString(),
      clientIp: getMediaClientIp(request.headers),
    });
    return NextResponse.json({ url: signed.url, expiresAt: signed.expiresAt }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    }
    if (error instanceof PremiumMediaConfigurationError) {
      console.error('Premium media configuration error');
      return NextResponse.json({ error: 'Premium media is unavailable' }, { status: 503, headers: noStoreHeaders });
    }
    console.error('Premium media authorization failed');
    return NextResponse.json({ error: 'Media authorization failed' }, { status: 403, headers: noStoreHeaders });
  }
}
