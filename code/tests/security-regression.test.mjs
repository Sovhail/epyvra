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

test('browser settings use explicit projections and raw settings remain server-only', async () => {
  const dataActions = await source('src', 'lib', 'data.actions.ts');
  const serverSettings = await source('src', 'lib', 'server-settings.ts');
  const publicGeneral = dataActions.match(/function publicGeneralSettings[\s\S]*?\n\}/)?.[0] ?? '';
  const publicPayments = dataActions.match(/function publicPaymentSettings[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(serverSettings, /import 'server-only'/);
  assert.doesNotMatch(publicGeneral, /smtpPassword|firebaseServiceAccount|purchaseCode|licenseKey/);
  assert.doesNotMatch(publicPayments, /Secret|secret|Password|password/);
  assert.match(dataActions, /delete publicSettings\.apiKey/);
});

test('admin sessions are signed, expiring, and checked against server state', async () => {
  const session = await source('src', 'lib', 'admin-session.ts');
  const middleware = await source('src', 'middleware.ts');
  const auth = await source('src', 'lib', 'actions', 'auth.ts');
  assert.match(session, /HMAC/);
  assert.match(session, /ADMIN_SESSION_SECRET/);
  assert.match(session, /expiresAt/);
  assert.match(middleware, /verifyAdminSessionToken\(authCookie\.value\)/);
  assert.match(auth, /admin\.username === session\.subject/);
  assert.match(auth, /admin\.sessionVersion/);
});

test('installation mutations require a one-time setup token and cannot overwrite an admin', async () => {
  const installAuth = await source('src', 'lib', 'install-auth.ts');
  const auth = await source('src', 'lib', 'actions', 'auth.ts');
  const content = await source('src', 'lib', 'actions', 'content.ts');
  const activation = await source('src', 'app', 'api', 'install', 'activate', 'route.ts');
  assert.match(installAuth, /INSTALL_SETUP_TOKEN/);
  assert.match(installAuth, /findOne\(\{ _id: 'admin' \}\)/);
  assert.match(auth, /authorizeInstall\(data\.setupToken\)/);
  assert.match(auth, /insertOne\(\{ _id: 'admin'/);
  const setupAdmin = auth.match(/export async function installSetupAdminAction[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(setupAdmin, /upsert:\s*true/);
  assert.match(content, /installInitializeDbAction[\s\S]*?authorizeInstall\(setupToken\)/);
  assert.match(activation, /authorizeInstall\([^)]*setupToken/);
});

test('server-side remote fetches reject private networks and validate every redirect', async () => {
  const safeFetch = await source('src', 'lib', 'safe-fetch.ts');
  const video = await source('src', 'app', 'api', 'video', 'route.ts');
  const activation = await source('src', 'app', 'api', 'install', 'activate', 'route.ts');
  const dataActions = await source('src', 'lib', 'data.actions.ts');
  assert.match(safeFetch, /node:dns\/promises/);
  assert.match(safeFetch, /Only HTTP\(S\) remote URLs are allowed/);
  assert.match(safeFetch, /a === 127/);
  assert.match(safeFetch, /a === 169 && b === 254/);
  assert.match(safeFetch, /a === 10/);
  assert.match(safeFetch, /normalized === '::1'/);
  assert.match(safeFetch, /redirect: 'manual'/);
  assert.match(safeFetch, /EPYVRA_REMOTE_FETCH_HOSTS must be configured in production/);
  assert.match(safeFetch, /allowedHosts\.includes\(url\.hostname\.toLowerCase\(\)\)/);
  assert.match(safeFetch, /assertPublicHttpUrl\(new URL\(location, current\)/);
  assert.match(video, /safeFetch\(filePath/);
  assert.match(activation, /safeFetch\(apiUrl/);
  assert.match(dataActions, /safeFetch\(apiUrl/);
});

test('storage provider host components are constrained before credentials are sent', async () => {
  const safeFetch = await source('src', 'lib', 'safe-fetch.ts');
  const upload = await source('src', 'app', 'api', 'upload', 'route.ts');
  const storage = await source('src', 'lib', 'storage-utils.ts');
  assert.match(safeFetch, /\^\[a-z0-9-\]\{1,16\}\$/);
  assert.match(upload, /normalizeBunnyRegion\(config\.region\)/);
  assert.match(upload, /await assertPublicHttpUrl/);
  assert.match(storage, /normalizeBunnyRegion\(config\.region\)/);
  assert.match(storage, /await assertPublicHttpUrl/);
  assert.match(storage, /filePath\.startsWith\(`\$\{uploadRoot\}\$\{sep\}`\)/);
});

test('Google Play credits only verified purchase tokens through an atomic idempotent grant', async () => {
  const googlePlay = await source('src', 'lib', 'google-play-purchases.ts');
  const route = await source('src', 'app', 'api', 'mobile', 'v1', 'verify-purchase', 'route.ts');
  const payment = await source('src', 'lib', 'actions', 'payment.ts');
  assert.match(route, /gateway === 'gplay' \? body\.purchaseToken : body\.sessionId/);
  assert.match(payment, /processGooglePlayPurchase\(userId, pack, sessionId, paySettings\)/);
  assert.match(googlePlay, /purchaseState !== 0/);
  assert.match(googlePlay, /purchase\.productId !== productId/);
  assert.match(googlePlay, /obfuscatedExternalAccountId !== accountHash\(userId\)/);
  assert.match(googlePlay, /session\.withTransaction/);
  assert.match(googlePlay, /writeConcern: \{ w: 'majority' \}/);
  assert.match(googlePlay, /_id: purchaseId/);
  assert.match(googlePlay, /:consume`/);
  assert.match(googlePlay, /:acknowledge`/);
});

test('Android billing submits purchaseToken, handles pending state, and reconciles owned purchases', async () => {
  const screen = await source('..', 'Android App', 'app', 'src', 'main', 'java', 'com', 'epyvra', 'app', 'ui', 'screens', 'TopUpScreen.kt');
  const repository = await source('..', 'Android App', 'app', 'src', 'main', 'java', 'com', 'epyvra', 'app', 'data', 'EpyvraRepository.kt');
  assert.match(screen, /purchase\.purchaseToken/);
  assert.match(screen, /Purchase\.PurchaseState\.PENDING/);
  assert.match(screen, /setObfuscatedAccountId\(obfuscatedPlayAccountId/);
  assert.match(screen, /queryPurchasesAsync/);
  assert.match(screen, /Lifecycle\.Event\.ON_RESUME/);
  assert.match(repository, /put\("purchaseToken", purchaseReference\)/);
  assert.doesNotMatch(screen, /purchase\.orderId \?: purchase\.purchaseToken/);
});
