import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 600;

export class PremiumMediaConfigurationError extends Error {}

export type PremiumMediaConfig = {
  cdnHost: string;
  tokenKey: string;
  ttlSeconds: number;
  bindToIp: boolean;
};

function normalizeHost(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!candidate || candidate.includes('/') || candidate.includes(':')) {
    throw new PremiumMediaConfigurationError('BUNNY_CDN_HOST must be a hostname only.');
  }
  return candidate;
}

export function getPremiumMediaConfig(env: NodeJS.ProcessEnv = process.env): PremiumMediaConfig {
  const tokenKey = env.BUNNY_CDN_TOKEN_KEY?.trim() ?? '';
  const host = env.BUNNY_CDN_HOST?.trim() ?? '';
  if (!tokenKey || tokenKey.length < 32 || !host) {
    throw new PremiumMediaConfigurationError('Premium media CDN signing is not configured.');
  }

  const parsedTtl = Number(env.PREMIUM_MEDIA_TOKEN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isInteger(parsedTtl) || parsedTtl < 30 || parsedTtl > MAX_TTL_SECONDS) {
    throw new PremiumMediaConfigurationError('Premium media token TTL must be between 30 and 600 seconds.');
  }

  return {
    cdnHost: normalizeHost(host),
    tokenKey,
    ttlSeconds: parsedTtl,
    bindToIp: env.PREMIUM_MEDIA_BIND_IP !== 'false',
  };
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\n/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function ipBytes(ip: string): Buffer {
  if (isIP(ip) === 4) return Buffer.from(ip.split('.').map(Number));
  if (isIP(ip) !== 6) throw new Error('Client IP is invalid.');
  const [leftText, rightText = ''] = ip.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  const parts = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  const bytes = Buffer.alloc(16);
  parts.forEach((part, index) => bytes.writeUInt16BE(Number.parseInt(part || '0', 16), index * 2));
  bytes.fill(0, 8); // Bunny binds IPv6 at /64 to tolerate privacy-address rotation.
  return bytes;
}

function advancedToken(key: string, path: string, expiresAt: number, ip: string): string {
  // Bunny Advanced Token Authentication (current official algorithm):
  // https://bunny.net/docs/cdn/security/token-authentication/advanced
  // Official implementation: https://github.com/BunnyWay/BunnyCDN.TokenAuthentication/tree/master/nodejs
  // This is deliberately not Bunny's separate legacy/basic MD5 token mode.
  const hmac = createHmac('sha256', key);
  hmac.update(path);
  hmac.update(String(expiresAt));
  if (ip) hmac.update(ipBytes(ip));
  hmac.update(`token_path=${path}`);
  return `HS256-${ip ? '1-' : ''}${base64Url(hmac.digest())}`;
}

function episodeDirectory(pathname: string): string {
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash <= 0) throw new Error('Premium media must be stored in a dedicated episode directory.');
  return `${pathname.slice(0, lastSlash + 1)}`;
}

export function signBunnyMediaUrl(input: {
  sourceUrl: string;
  episodeId: string;
  clientIp?: string;
  nowSeconds?: number;
  config?: PremiumMediaConfig;
}): { url: string; expiresAt: number; contentPath: string } {
  const config = input.config ?? getPremiumMediaConfig();
  const source = new URL(input.sourceUrl);
  if (source.protocol !== 'https:' || source.hostname.toLowerCase() !== config.cdnHost) {
    throw new Error('Premium media source is outside the configured Bunny CDN host.');
  }
  if (source.username || source.password || source.search || source.hash || source.pathname.includes('/../')) {
    throw new Error('Premium media source URL is not canonical.');
  }

  const extension = source.pathname.toLowerCase().split('.').pop() ?? '';
  const segmented = ['m3u8', 'mpd'].includes(extension);
  const contentPath = segmented ? episodeDirectory(source.pathname) : source.pathname;
  if (!contentPath.toLowerCase().includes(input.episodeId.toLowerCase())) {
    throw new Error('Premium media path is not bound to the requested episode.');
  }
  if (config.bindToIp && !input.clientIp) {
    throw new Error('Client IP is required for premium media authorization.');
  }

  const expiresAt = (input.nowSeconds ?? Math.floor(Date.now() / 1000)) + config.ttlSeconds;
  const ip = config.bindToIp ? input.clientIp! : '';
  const token = advancedToken(config.tokenKey, contentPath, expiresAt, ip);
  const authSegment = `bcdn_token=${token}&token_path=${encodeURIComponent(contentPath)}&expires=${expiresAt}`;
  // Bunny's path-token form keeps the auth segment in the base URL. Relative HLS/DASH
  // references therefore resolve beneath the same token segment without manifest proxying.
  const signedPath = `/${authSegment}${source.pathname}`;

  return { url: `https://${config.cdnHost}${signedPath}`, expiresAt, contentPath };
}

export function verifyBunnyMediaUrl(input: {
  signedUrl: string;
  sourceUrl: string;
  episodeId: string;
  clientIp?: string;
  nowSeconds?: number;
  config: PremiumMediaConfig;
}): boolean {
  try {
    const signed = new URL(input.signedUrl);
    const match = signed.pathname.match(/^\/bcdn_token=([^&/]+)&token_path=([^&/]+)&expires=(\d+)(\/.*)$/);
    if (!match || signed.hostname !== input.config.cdnHost) return false;
    const [, suppliedToken, encodedContentPath, expiryText, deliveredPath] = match;
    const expiresAt = Number(expiryText);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > input.config.ttlSeconds) return false;

    const source = new URL(input.sourceUrl);
    const contentPath = decodeURIComponent(encodedContentPath);
    const expectedContentPath = ['m3u8', 'mpd'].includes(source.pathname.toLowerCase().split('.').pop() ?? '')
      ? episodeDirectory(source.pathname)
      : source.pathname;
    const segmented = ['m3u8', 'mpd'].includes(source.pathname.toLowerCase().split('.').pop() ?? '');
    if (source.hostname !== input.config.cdnHost ||
        (segmented ? !deliveredPath.startsWith(contentPath) : deliveredPath !== source.pathname) ||
        contentPath !== expectedContentPath || !contentPath.toLowerCase().includes(input.episodeId.toLowerCase())) return false;
    if (input.config.bindToIp && !input.clientIp) return false;

    const ip = input.config.bindToIp ? input.clientIp! : '';
    const expectedToken = advancedToken(input.config.tokenKey, contentPath, expiresAt, ip);
    const supplied = Buffer.from(suppliedToken);
    const expected = Buffer.from(expectedToken);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export function getMediaClientIp(headers: Headers): string | undefined {
  const value = headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0];
  const ip = value?.trim();
  if (!ip || !/^[0-9a-f:.]{3,45}$/i.test(ip)) return undefined;
  return ip;
}
