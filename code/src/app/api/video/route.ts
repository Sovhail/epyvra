import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { getServerPluginsSettings as getPluginsSettings } from '@/lib/server-settings';
import { getServerStorageSettings as getStorageSettings } from '@/lib/server-settings';
import { decryptPath } from '@/lib/crypto';
import { getVideoSecret } from '@/lib/video-secret';
import { normalizeBunnyRegion, safeFetch } from '@/lib/safe-fetch';
import { signBunnyUpstreamUrl } from '@/lib/premium-media';

function streamFile(path: string, options?: { start?: number; end?: number }): ReadableStream<Uint8Array> {
    const readStream = fs.createReadStream(path, { highWaterMark: 1024 * 1024, ...options });
    if (typeof Readable.toWeb === 'function') {
        return Readable.toWeb(readStream) as ReadableStream<Uint8Array>;
    }
    return new ReadableStream({
        start(controller) {
            readStream.on('data', chunk => controller.enqueue(
                typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
            ));
            readStream.on('end', () => controller.close());
            readStream.on('error', (error: NodeJS.ErrnoException) => controller.error(error));
        },
        cancel() {
            readStream.destroy();
        },
    });
}

function getTimeKeys(period: string, now: number): string[] {
    let current = '';
    let previous = '';
    
    switch(period) {
        case '1h': {
            const h = Math.floor(now / 3600000);
            current = String(h);
            previous = String(h - 1);
            break;
        }
        case '12h': {
            const h = Math.floor(now / 43200000);
            current = String(h);
            previous = String(h - 1);
            break;
        }
        case '24h': {
            const date = new Date(now);
            current = date.toISOString().split('T')[0];
            const prevDate = new Date(now - 24 * 60 * 60 * 1000);
            previous = prevDate.toISOString().split('T')[0];
            break;
        }
        case '1w': {
            const w = Math.floor(now / 604800000);
            current = String(w);
            previous = String(w - 1);
            break;
        }
        case '1mo': {
            const date = new Date(now);
            current = `${date.getFullYear()}-${date.getMonth()}`;
            const prevDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
            previous = `${prevDate.getFullYear()}-${prevDate.getMonth()}`;
            break;
        }
        default: {
            const date = new Date(now);
            current = date.toISOString().split('T')[0];
            const prevDate = new Date(now - 24 * 60 * 60 * 1000);
            previous = prevDate.toISOString().split('T')[0];
        }
    }
    return [current, previous];
}

function bunnyStorageUrl(source: URL, zoneName: string, regionValue: unknown): string {
    const zone = zoneName.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(zone)) throw new Error('Invalid Bunny storage zone name.');
    const region = normalizeBunnyRegion(regionValue);
    const host = region ? `${region}.storage.bunnycdn.com` : 'storage.bunnycdn.com';
    const segments = source.pathname.split('/').filter(Boolean).map(segment => {
        const decoded = decodeURIComponent(segment);
        if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
            throw new Error('Invalid Bunny storage object path.');
        }
        return encodeURIComponent(decoded);
    });
    if (segments.length === 0) throw new Error('Bunny storage object path is empty.');
    return `https://${host}/${encodeURIComponent(zone)}/${segments.join('/')}`;
}

/**
 * This API route acts as a secure proxy for uploaded/cloud video files.
 * It decrypts the secure parameter and streams the content.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const encryptedKey = searchParams.get('v');

    if (!encryptedKey) {
        return new NextResponse('Missing parameter', { status: 400 });
    }

    let secret = '';
    try {
        secret = await getVideoSecret();
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Could not load video signing secret:', error);
        }
        return new NextResponse('Internal Server Error: video security is unavailable.', { status: 500 });
    }
    let decrypted = '';
    try {
        decrypted = decryptPath(encryptedKey, secret);
    } catch {
        return new NextResponse('Access Denied: Invalid security key', { status: 403 });
    }
    
    const parts = decrypted.split('|');
    if (parts.length !== 2) {
        return new NextResponse('Access Denied: Invalid security payload', { status: 403 });
    }
    
    const [filePath, embeddedTimeKey] = parts;

    // Fetch protection settings from MongoDB
    const pluginsSettings = await getPluginsSettings();
    const isProtectionEnabled = pluginsSettings?.videoProtectionEnabled !== false;

    if (isProtectionEnabled) {
        const period = pluginsSettings?.videoRotationPeriod || '24h';
        const [currentKey, previousKey] = getTimeKeys(period, Date.now());
        
        if (embeddedTimeKey !== currentKey && embeddedTimeKey !== previousKey) {
            return new NextResponse('Access Denied: Security key expired', { status: 403 });
        }
    }

    const isRemote = filePath.startsWith('http://') || filePath.startsWith('https://');
    
    if (isRemote) {
        try {
            let upstreamUrl = filePath;
            const storageSettings = await getStorageSettings();
            const bunny = storageSettings?.activeProvider === 'bunny' ? storageSettings.bunny : undefined;
            let bunnySource: URL | null = null;
            if (bunny?.pullZoneUrl) {
                const pullZone = new URL(bunny.pullZoneUrl);
                const source = new URL(filePath);
                if (source.hostname.toLowerCase() === pullZone.hostname.toLowerCase()) {
                    bunnySource = source;
                    upstreamUrl = signBunnyUpstreamUrl({
                        sourceUrl: filePath,
                        expectedHost: pullZone.hostname,
                    });
                }
            }
            const range = request.headers.get('range');
            const headers: Record<string, string> = {
                'accept-encoding': 'identity',
                'user-agent': request.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'referer': request.headers.get('referer') || request.nextUrl.origin || 'http://localhost:3000'
            };
            if (range) {
                headers['range'] = range;
            }
            
            let response = await safeFetch(upstreamUrl, {
                headers,
                cache: 'no-store',
            }, 3);

            // A Pull Zone may reject an otherwise valid CDN token when its key
            // was rotated or another Bunny security control is enabled. Keep
            // the public CDN protected and retry server-to-server through the
            // authenticated Storage API. The credential never reaches clients.
            if (response.status === 403 && bunnySource && bunny?.storageZoneName && bunny.apiKey) {
                const storageHeaders: Record<string, string> = {
                    'AccessKey': bunny.apiKey,
                    'accept-encoding': 'identity',
                };
                if (range) storageHeaders.range = range;
                response = await fetch(bunnyStorageUrl(bunnySource, bunny.storageZoneName, bunny.region), {
                    headers: storageHeaders,
                    cache: 'no-store',
                    redirect: 'error',
                });
            }
            
            const responseHeaders = new Headers();
            const contentType = response.headers.get('content-type') || response.headers.get('Content-Type');
            responseHeaders.set('Content-Type', contentType && contentType !== 'application/octet-stream' ? contentType : 'video/mp4');
            responseHeaders.set('Accept-Ranges', 'bytes');
            
            const contentRange = response.headers.get('content-range') || response.headers.get('Content-Range');
            if (contentRange) {
                responseHeaders.set('Content-Range', contentRange);
            }
            const contentLength = response.headers.get('content-length') || response.headers.get('Content-Length');
            if (contentLength) {
                responseHeaders.set('Content-Length', contentLength);
            }
            const etag = response.headers.get('etag') || response.headers.get('ETag');
            if (etag) {
                responseHeaders.set('ETag', etag);
            }
            const lastMod = response.headers.get('last-modified') || response.headers.get('Last-Modified');
            if (lastMod) {
                responseHeaders.set('Last-Modified', lastMod);
            }
            responseHeaders.set(
                'Cache-Control',
                response.ok || response.status === 206
                    ? 'public, max-age=86400, stale-while-revalidate=604800'
                    : 'private, no-store, max-age=0'
            );
            responseHeaders.set('Content-Disposition', 'inline');
            responseHeaders.set('Access-Control-Allow-Origin', '*');
            responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
            
            return new NextResponse(response.body, {
                status: response.status,
                headers: responseHeaders
            });
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Error streaming cloud video:', error);
            }
            return new NextResponse('Failed to retrieve video stream', { status: 502 });
        }
    } else {
        // Sanitize path (must be within uploads/videos)
        const fileName = filePath.split('/').pop();
        if (!fileName) return new NextResponse('Invalid file', { status: 400 });

        const fullPath = join(process.cwd(), 'public', 'uploads', 'videos', fileName);

        if (!fs.existsSync(fullPath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        // Handle range requests for video seeking and instant fast-start streaming
        const stat = fs.statSync(fullPath);
        const fileSize = stat.size;
        const range = request.headers.get('range');
        
        let contentType = 'video/mp4';
        if (fullPath.endsWith('.webm')) contentType = 'video/webm';
        else if (fullPath.endsWith('.m3u8')) contentType = 'application/x-mpegURL';
        else if (fullPath.endsWith('.ts')) contentType = 'video/MP2T';

        if (range) {
            let start = 0;
            let end = fileSize - 1;

            const matches = range.match(/bytes=(\d*)-(\d*)/);
            if (matches) {
                const startStr = matches[1];
                const endStr = matches[2];

                if (startStr === "" && endStr !== "") {
                    // Suffix range request (e.g. bytes=-1048576) - critical for MP4 moov atom / fast start
                    const suffixLength = parseInt(endStr, 10);
                    if (!isNaN(suffixLength) && suffixLength > 0) {
                        start = Math.max(0, fileSize - suffixLength);
                        end = fileSize - 1;
                    }
                } else if (startStr !== "" && endStr === "") {
                    // Open-ended range request (e.g. bytes=0-)
                    const parsedStart = parseInt(startStr, 10);
                    if (!isNaN(parsedStart)) {
                        start = parsedStart;
                        end = fileSize - 1;
                    }
                } else if (startStr !== "" && endStr !== "") {
                    // Exact range request (e.g. bytes=0-1024)
                    const parsedStart = parseInt(startStr, 10);
                    const parsedEnd = parseInt(endStr, 10);
                    if (!isNaN(parsedStart) && !isNaN(parsedEnd)) {
                        start = parsedStart;
                        end = Math.min(parsedEnd, fileSize - 1);
                    }
                }
            }


            // Ensure start and end are within valid bounds
            if (isNaN(start) || isNaN(end) || start >= fileSize || start > end) {
                return new NextResponse('Range Not Satisfiable', {
                    status: 416,
                    headers: {
                        'Content-Range': `bytes */${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
                    }
                });
            }

            const chunksize = (end - start) + 1;
            const fileStream = streamFile(fullPath, { start, end });
            
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize.toString(),
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
            };

            return new NextResponse(fileStream, { status: 206, headers: head });
        } else {
            const head = {
                'Content-Length': fileSize.toString(),
                'Content-Type': contentType,
                'Content-Disposition': 'inline',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
            };
            const fileStream = streamFile(fullPath);
            return new NextResponse(fileStream, { status: 200, headers: head });
        }
    }
}
