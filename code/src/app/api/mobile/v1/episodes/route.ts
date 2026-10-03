import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getSecureVideoUrl } from '@/lib/actions';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

type SettingsDocument = { _id: string; apiKey?: string; episodeCost?: number };
type UserDocument = { _id: string; isVip?: boolean; vipExpiry?: string | Date };
type SeriesDocument = { _id: string | ObjectId; freeEpisodesCount?: number };
type SubtitleDocument = { language?: string; languageCode?: string; url?: string };
type EpisodeDocument = {
    _id: string | ObjectId;
    seriesId?: string;
    title?: string;
    episodeInSeason?: number;
    durationSec?: number;
    duration?: number;
    videoSources?: Array<{ url?: string }>;
    subtitles?: SubtitleDocument[];
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const apiKey = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('apiKey');
        if (!apiKey) {
            return NextResponse.json({ error: 'Unauthorized - Missing API Key' }, { status: 401 });
        }

        const db = await getDb();
        const settings = await db.collection<SettingsDocument>('settings').findOne({ _id: 'mobile' });
        if (!settings || !settings.apiKey || settings.apiKey !== apiKey) {
            return NextResponse.json({ error: 'Unauthorized - Invalid API Key' }, { status: 401 });
        }

        const seriesId = request.nextUrl.searchParams.get('seriesId');
        if (!seriesId) {
            return NextResponse.json({ error: 'Missing seriesId parameter' }, { status: 400 });
        }

        // Fetch series to know how many free episodes it has
        const seriesKey = ObjectId.isValid(seriesId) ? new ObjectId(seriesId) : seriesId;
        const series = await db.collection<SeriesDocument>('series').findOne({ _id: seriesKey });
        const freeCount = series?.freeEpisodesCount ?? 3;

        // Fetch monetization settings for coin cost
        const monSettings = await db.collection<SettingsDocument>('settings').findOne({ _id: 'monetization' });
        const defaultCost = monSettings?.episodeCost ?? 10;

        let authenticatedUid: string | null = null;
        const authorization = request.headers.get('authorization');
        if (authorization) {
            try {
                authenticatedUid = (await authenticateFirebaseRequest(request)).uid;
            } catch (error) {
                if (error instanceof ApiAuthError) {
                    return NextResponse.json({ error: error.message }, { status: error.status });
                }
                throw error;
            }
        }

        const user = authenticatedUid
            ? await db.collection<UserDocument>('users').findOne({ _id: authenticatedUid })
            : null;
        const vipActive = user?.isVip === true &&
            (!user.vipExpiry || new Date(user.vipExpiry).getTime() > Date.now());
        const unlockedEpisodeIds = new Set(
            authenticatedUid
                ? (await db.collection('unlocked-episodes')
                    .find({ userId: authenticatedUid })
                    .project({ episodeId: 1 })
                    .toArray())
                    .map(item => String(item.episodeId))
                : [],
        );

        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
        const forwardedProto = request.headers.get('x-forwarded-proto');
        const protocol = forwardedProto ? `${forwardedProto}:` : (request.nextUrl.protocol || 'http:');
        const cleanProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`;
        const origin = `${cleanProtocol}//${host}`;

        // Fetch episodes sorted by number
        const episodes = await db.collection<EpisodeDocument>('episodes')
            .find({ seriesId: seriesId })
            .sort({ episodeInSeason: 1 })
            .toArray();

        const mappedEpisodes = await Promise.all(episodes.map(async (ep) => {
            const epNum = ep.episodeInSeason || 1;
            const isPremium = epNum > freeCount;
            const isEntitled = !isPremium || vipActive || unlockedEpisodeIds.has(ep._id.toString());
            const rawVideoUrl = ep.videoSources?.[0]?.url || '';
            const secureUrl = isEntitled ? await getSecureVideoUrl(rawVideoUrl) : '';
            const videoUrl = secureUrl ? (secureUrl.startsWith('http') ? secureUrl : `${origin}${secureUrl}`) : '';
            return {
                id: ep._id.toString(),
                dramaId: ep.seriesId || seriesId,
                title: ep.title || `Episode ${epNum}`,
                episodeNumber: epNum,
                videoUrl: videoUrl,
                isPremium: isPremium,
                isEntitled,
                coinCost: isPremium ? defaultCost : 0,
                durationSec: ep.durationSec || ep.duration || 0,
                subtitles: (ep.subtitles || []).map((sub) => {
                    const rawSubUrl = sub.url || '';
                    let subUrl = rawSubUrl ? (rawSubUrl.startsWith('http') ? rawSubUrl : `${origin}${rawSubUrl}`) : '';
                    if (subUrl.includes('/uploads/videos/') || subUrl.includes('/uploads/subtitles/')) {
                        const fileName = subUrl.split('/').pop()?.split('?')[0] || '';
                        if (fileName) {
                            subUrl = `${origin}/api/subtitles?file=${encodeURIComponent(fileName)}`;
                        }
                    }
                    return {
                        language: sub.language || 'English',
                        languageCode: sub.languageCode || 'en',
                        url: subUrl,
                    };
                }).filter((subtitle) => subtitle.url)
            };
        }));

        return NextResponse.json(mappedEpisodes);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load episodes';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
