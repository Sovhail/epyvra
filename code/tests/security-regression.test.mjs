import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const source = (...parts) => readFile(path.join(process.cwd(), ...parts), 'utf8');

test('account creation derives UID and coins from trusted server state', async () => {
  const route = await source('src', 'app', 'api', 'user', 'create', 'route.ts');
  assert.match(route, /const identity = await authenticateFirebaseRequest\(request\)/);
  assert.match(route, /const uid = identity\.uid/);
  assert.match(route, /coins: Number\(signupBonus\)/);
  assert.doesNotMatch(route, /\{[^}]*coins[^}]*\}\s*=\s*body/);
});

test('every UID-scoped monetary route binds the Firebase identity', async () => {
  for (const name of ['claim', 'checkin', 'unlock', 'referral']) {
    const route = await source('src', 'app', 'api', 'user', '[uid]', name, 'route.ts');
    assert.match(route, /authenticateFirebaseRequest\(request, \{[^}]*targetUid: uid/);
  }
});

test('coin mutations reserve an idempotency operation inside a Mongo transaction', async () => {
  const operations = await source('src', 'lib', 'coin-operations.ts');
  assert.match(operations, /session\.withTransaction/);
  assert.match(operations, /reserveOperation\(/);
  assert.match(operations, /writeConcern: \{ w: 'majority' \}/);
  assert.match(operations, /operationId = `checkin:/);
  assert.match(operations, /operationId = `episode-unlock:/);
});

test('reward claims require a one-time, time-bound server challenge', async () => {
  const operations = await source('src', 'lib', 'coin-operations.ts');
  assert.match(operations, /reward-challenges/);
  assert.match(operations, /eligibleAt: \{ \$lte: now \}/);
  assert.match(operations, /usedAt: \{ \$exists: false \}/);
  assert.match(operations, /Rewarded-ad verification is not configured/);
});

test('legacy client-callable monetary server actions fail closed', async () => {
  const userActions = await source('src', 'lib', 'actions', 'user.ts');
  const contentActions = await source('src', 'lib', 'actions', 'content.ts');
  assert.match(userActions, /LEGACY_MONETARY_ACTIONS_DISABLED: boolean = true/);
  assert.match(contentActions, /legacyMonetaryActionsDisabled: boolean = true/);
});

test('Firestore denies client writes to monetary and entitlement records', async () => {
  const rules = await source('firestore.rules');
  for (const collection of ['unlockedEpisodes', 'coinTransactions', 'adWatches']) {
    const block = rules.match(new RegExp(`match /${collection}\\/\\{[^}]+\\} \\{([\\s\\S]*?)\\n      \\}`));
    assert.ok(block, `missing ${collection} rule`);
    assert.match(block[1], /allow write: if false/);
  }
  assert.match(rules, /match \/purchases\/\{purchaseId\}[\s\S]*?allow read, write: if false/);
  assert.match(rules, /match \/settings\/\{settingId\}[\s\S]*?allow read, write: if false/);
});
