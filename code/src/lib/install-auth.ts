import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/mongodb';

export async function authorizeInstall(setupToken: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = process.env.INSTALL_SETUP_TOKEN?.trim() ?? '';
  if (expected.length < 32 || expected === 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS') {
    return { ok: false, error: 'INSTALL_SETUP_TOKEN is not securely configured.' };
  }
  const provided = setupToken.trim();
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return { ok: false, error: 'Invalid setup token.' };
  }

  const db = await getDb();
  const installed = await db.collection<{ _id: string }>('settings').findOne({ _id: 'admin' });
  if (installed) return { ok: false, error: 'Installation is already complete.' };
  return { ok: true };
}

