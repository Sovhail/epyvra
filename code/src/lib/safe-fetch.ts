import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;

function isBlockedIpv4(address: string): boolean {
    const octets = address.split('.').map(Number);
    if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
    const [a, b, c] = octets;
    return a === 0 || a === 10 || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
        || (a === 198 && b === 51 && c === 100)
        || (a === 203 && b === 0 && c === 113)
        || a >= 224;
}

function isBlockedIp(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0];
    if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
    if (isIP(normalized) !== 6) return true;
    const mapped = normalized.match(/^(?:::ffff:|(?:0*:){5}ffff:)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIpv4(mapped[1]);
    return normalized === '::' || normalized === '::1'
        || normalized.startsWith('fc') || normalized.startsWith('fd')
        || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff')
        || normalized.startsWith('2001:db8:');
}

export async function assertPublicHttpUrl(input: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new Error('Remote URL is invalid.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only HTTP(S) remote URLs are allowed.');
    if (url.username || url.password) throw new Error('Remote URLs cannot contain credentials.');
    if (!url.hostname || url.hostname.endsWith('.local') || url.hostname === 'localhost') throw new Error('Private network targets are not allowed.');

    const allowedHosts = (process.env.EPYVRA_REMOTE_FETCH_HOSTS ?? '')
        .split(',')
        .map(host => host.trim().toLowerCase())
        .filter(Boolean);
    if (process.env.NODE_ENV === 'production' && allowedHosts.length === 0) {
        throw new Error('EPYVRA_REMOTE_FETCH_HOSTS must be configured in production.');
    }
    if (allowedHosts.length > 0 && !allowedHosts.includes(url.hostname.toLowerCase())) {
        throw new Error('Remote host is not allowlisted.');
    }

    const literal = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(literal) ? [{ address: literal }] : await lookup(literal, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(result => isBlockedIp(result.address))) {
        throw new Error('Private or reserved network targets are not allowed.');
    }
    return url;
}

export function normalizeBunnyRegion(input: unknown): string {
    const region = typeof input === 'string' ? input.trim().toLowerCase() : '';
    if (!region || region === 'de') return '';
    if (!/^[a-z0-9-]{1,16}$/.test(region)) throw new Error('Invalid Bunny storage region.');
    return region;
}

export async function safeFetch(input: string, init: RequestInit = {}, maxRedirects = 0): Promise<Response> {
    let current = await assertPublicHttpUrl(input);
    for (let redirectCount = 0; ; redirectCount += 1) {
        const response = await fetch(current, { ...init, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        if (redirectCount >= Math.min(maxRedirects, MAX_REDIRECTS)) throw new Error('Remote redirect is not allowed.');
        const location = response.headers.get('location');
        if (!location) throw new Error('Remote redirect has no destination.');
        current = await assertPublicHttpUrl(new URL(location, current).toString());
    }
}
