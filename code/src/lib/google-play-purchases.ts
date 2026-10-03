import 'server-only';

import { createHash, sign } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { ServerPaymentGatewaySettings } from '@/lib/server-types';

type PurchaseResult = { success: boolean; error?: string; message?: string; finalizationPending?: boolean };
type StringIdDocument = Record<string, unknown> & { _id: string };
type UserDocument = { _id: string; disabled?: boolean; vipExpiry?: Date | string; coins?: number; isVip?: boolean };

interface GoogleProductPurchase {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  productId?: string;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  quantity?: number;
}

interface GoogleSubscriptionPurchase {
  subscriptionState?: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId?: string; expiryTime?: string }>;
}

function tokenKey(purchaseToken: string): string {
  return `gplay:${createHash('sha256').update(purchaseToken).digest('hex')}`;
}

function accountHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const cleanKey = privateKey.replace(/\\n/g, '\n');
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const signatureInput = `${header}.${payload}`;
  const assertion = `${signatureInput}.${sign('RSA-SHA256', Buffer.from(signatureInput), cleanKey).toString('base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google Play OAuth failed.');
  return data.access_token;
}

async function googleRequest<T>(url: string, accessToken: string, method = 'GET'): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Play API request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  return (response.status === 204 ? {} : await response.json()) as T;
}

async function finalizePurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
  isSubscription: boolean,
  accessToken: string,
): Promise<void> {
  const encodedPackage = encodeURIComponent(packageName);
  const encodedProduct = encodeURIComponent(productId);
  const encodedToken = encodeURIComponent(purchaseToken);
  const url = isSubscription
    ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptions/${encodedProduct}/tokens/${encodedToken}:acknowledge`
    : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/products/${encodedProduct}/tokens/${encodedToken}:consume`;
  await googleRequest(url, accessToken, 'POST');
}

export async function processGooglePlayPurchase(
  userId: string,
  pack: Record<string, unknown>,
  purchaseToken: string,
  settings: ServerPaymentGatewaySettings,
): Promise<PurchaseResult> {
  const packageName = settings.googlePlayPackageName?.trim();
  const email = settings.googlePlayServiceAccountEmail?.trim();
  const privateKey = settings.googlePlayServiceAccountPrivateKey;
  const productId = typeof pack.googleProductId === 'string' ? pack.googleProductId.trim() : '';
  if (!packageName || packageName !== 'com.epyvra.app' || !email || !privateKey || !productId) {
    return { success: false, error: 'Google Play server verification is not securely configured.' };
  }
  if (!purchaseToken || purchaseToken.length > 4096) return { success: false, error: 'Invalid purchase token.' };

  const db = await getDb();
  const purchaseId = tokenKey(purchaseToken);
  const purchases = db.collection<StringIdDocument>('purchases');
  const users = db.collection<UserDocument>('users');
  const ledger = db.collection<StringIdDocument>('coin-transactions');
  const prior = await purchases.findOne({ _id: purchaseId });
  if (prior) {
    if (prior.userId !== userId) return { success: false, error: 'Purchase token is already bound to another account.' };
    if (prior.finalizationState !== 'complete') {
      try {
        const accessToken = await getGoogleAccessToken(email, privateKey);
        await finalizePurchase(packageName, String(prior.productId), purchaseToken, prior.entitlementType === 'subscription', accessToken);
        await purchases.updateOne({ _id: purchaseId, userId }, { $set: { finalizationState: 'complete', finalizedAt: new Date() } });
      } catch {
        return { success: true, message: 'Purchase already granted; Google Play finalization is queued.', finalizationPending: true };
      }
    }
    return { success: true, message: 'Purchase already processed.' };
  }

  const accessToken = await getGoogleAccessToken(email, privateKey);
  const encodedPackage = encodeURIComponent(packageName);
  const encodedProduct = encodeURIComponent(productId);
  const encodedToken = encodeURIComponent(purchaseToken);
  const isSubscription = pack.type === 'membership' || pack.type === 'vip';
  let orderId: string | undefined;
  let expiryTime: string | undefined;
  let needsFinalization = true;

  if (isSubscription) {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/subscriptionsv2/tokens/${encodedToken}`;
    const purchase = await googleRequest<GoogleSubscriptionPurchase>(url, accessToken);
    const lineItem = purchase.lineItems?.find(item => item.productId === productId);
    if (!lineItem || !['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(purchase.subscriptionState ?? '')) {
      return { success: false, error: 'Google Play subscription is not active or does not match this pack.' };
    }
    if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountHash(userId)) {
      return { success: false, error: 'Google Play purchase account does not match the signed-in user.' };
    }
    orderId = purchase.latestOrderId;
    expiryTime = lineItem.expiryTime;
    if (!expiryTime || !Number.isFinite(new Date(expiryTime).getTime()) || new Date(expiryTime).getTime() <= Date.now()) {
      return { success: false, error: 'Google Play subscription expiry is invalid or has elapsed.' };
    }
    needsFinalization = purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  } else {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackage}/purchases/products/${encodedProduct}/tokens/${encodedToken}`;
    const purchase = await googleRequest<GoogleProductPurchase>(url, accessToken);
    if (purchase.purchaseState !== 0 || purchase.consumptionState !== 0 || purchase.productId !== productId) {
      return { success: false, error: 'Google Play purchase is not completed, is consumed, or does not match this pack.' };
    }
    if (purchase.obfuscatedExternalAccountId !== accountHash(userId)) {
      return { success: false, error: 'Google Play purchase account does not match the signed-in user.' };
    }
    orderId = purchase.orderId;
  }

  const amount = Number(pack.amount);
  const durationDays = Number(pack.durationDays);
  if ((!isSubscription && (!Number.isSafeInteger(amount) || amount <= 0))
      || (isSubscription && (!Number.isSafeInteger(durationDays) || durationDays <= 0))) {
    return { success: false, error: 'Pack entitlement is invalid.' };
  }

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await users.findOne({ _id: userId, disabled: { $ne: true } }, { session });
      if (!user) throw new Error('User profile not found.');
      const now = new Date();
      let description: string;
      if (isSubscription) {
        const vipExpiry = new Date(expiryTime as string);
        await users.updateOne({ _id: userId }, { $set: { isVip: true, vipExpiry } }, { session });
        description = `Purchased Membership: ${String(pack.name ?? productId)}`;
      } else {
        await users.updateOne({ _id: userId }, { $inc: { coins: amount } }, { session });
        description = `Purchased Coins: ${String(pack.name ?? productId)}`;
      }
      await ledger.insertOne({
        _id: purchaseId, userId, type: 'purchase', amount: isSubscription ? 0 : amount, description, createdAt: now,
      }, { session });
      await purchases.insertOne({
        _id: purchaseId, userId, packId: String(pack.id ?? ''), packName: pack.name, productId, purchaseToken,
        orderId, gateway: 'gplay', entitlementType: isSubscription ? 'subscription' : 'consumable', state: 'granted',
        finalizationState: needsFinalization ? 'pending' : 'complete', createdAt: now,
      }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    const winner = await purchases.findOne({ _id: purchaseId });
    if (!winner || winner.userId !== userId) return { success: false, error: 'Purchase token is already bound to another account.' };
  } finally {
    await session.endSession();
  }

  if (needsFinalization) {
    try {
      await finalizePurchase(packageName, productId, purchaseToken, isSubscription, accessToken);
      await purchases.updateOne({ _id: purchaseId, userId }, { $set: { finalizationState: 'complete', finalizedAt: new Date() } });
    } catch {
      return { success: true, message: 'Purchase granted; Google Play finalization is queued.', finalizationPending: true };
    }
  }
  return { success: true, message: 'Purchase verified and granted.' };
}
