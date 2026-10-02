import { timingSafeEqual } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { NextRequest } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { getDb } from '@/lib/mongodb';

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

async function requireMobileApiKey(request: NextRequest): Promise<void> {
  const provided = request.headers.get('x-api-key')?.trim() ?? '';
  const db = await getDb();
  const settings = await db.collection('settings').findOne({ _id: 'mobile' as never });
  const expected = typeof settings?.apiKey === 'string' ? settings.apiKey.trim() : '';

  if (!provided || !expected || !secretsMatch(provided, expected)) {
    throw new ApiAuthError('Unauthorized', 401);
  }
}

export async function authenticateFirebaseRequest(
  request: NextRequest,
  options: { targetUid?: string; requireMobileApiKey?: boolean } = {},
): Promise<DecodedIdToken> {
  if (options.requireMobileApiKey) {
    await requireMobileApiKey(request);
  }

  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new ApiAuthError('Unauthorized', 401);
  }

  const idToken = authorization.slice('Bearer '.length).trim();
  if (!idToken) {
    throw new ApiAuthError('Unauthorized', 401);
  }

  try {
    const firebase = await getFirebaseAdmin();
    const decoded = await firebase.auth().verifyIdToken(idToken, true);

    if (options.targetUid && decoded.uid !== options.targetUid) {
      throw new ApiAuthError('Forbidden', 403);
    }

    return decoded;
  } catch (error) {
    if (error instanceof ApiAuthError) throw error;

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    if (code.startsWith('auth/')) {
      throw new ApiAuthError('Unauthorized', 401);
    }

    throw new ApiAuthError('Authentication service unavailable', 503);
  }
}

