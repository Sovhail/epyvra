export const ADMIN_SESSION_COOKIE = 'epyvra_admin_session';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
  version: 1;
  subject: string;
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  return secret.length >= 32 && secret !== 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS' ? secret : null;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createAdminSessionToken(subject: string, sessionVersion: number): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not securely configured.');
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    version: 1,
    subject,
    sessionVersion,
    issuedAt,
    expiresAt: issuedAt + SESSION_LIFETIME_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(token: string): Promise<AdminSessionPayload | null> {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const [encodedPayload, encodedSignature, extra] = token.split('.');
    if (!encodedPayload || !encodedSignature || extra) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as AdminSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== 1 ||
      typeof payload.subject !== 'string' ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.issuedAt > now + 60 ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > SESSION_LIFETIME_SECONDS
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

