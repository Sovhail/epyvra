import { getGeneralSettings } from '@/lib/data.actions';
import { NextResponse } from 'next/server';

export async function GET() {
    const settings = await getGeneralSettings();
    const siteUrl = (settings?.siteUrl || 'https://example.com').replace(/\/$/, '');
    const defaultRobots = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin/',
        'Disallow: /api/',
        'Disallow: /wallet',
        'Disallow: /profile',
        'Disallow: /*/wallet',
        'Disallow: /*/profile',
        `Sitemap: ${siteUrl}/sitemap.xml`,
    ].join('\n');
    const content = settings?.robotsTxt || defaultRobots;

    return new NextResponse(content, {
        headers: {
            'Content-Type': 'text/plain',
        },
    });
}
