import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env.local' });

const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  throw new Error('MONGODB_URI is required before starting EPYVRA.');
}

const minimumAndroidVersionCode = 9;
const androidPackageName = 'com.epyvra.app';
const playStoreUrl = `https://play.google.com/store/apps/details?id=${androidPackageName}`;
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });

try {
  await client.connect();
  const settings = client.db().collection('settings');
  const mobile = await settings.findOne({ _id: 'mobile' });
  const currentVersionCode = Number(mobile?.versionCode);
  const mobileUpdates = {};

  // Never replace the API key or owner-controlled feature flags here. These
  // migrations only correct stale EPYVRA metadata. updateUrl remains owner-
  // controlled until an official release artifact or Play listing exists.
  if (!Number.isFinite(currentVersionCode) || currentVersionCode < minimumAndroidVersionCode) {
    mobileUpdates.versionCode = minimumAndroidVersionCode;
  }
  if (mobile?.androidPackageName !== androidPackageName) {
    mobileUpdates.androidPackageName = androidPackageName;
  }
  if (mobile?.androidPlayStoreUrl !== playStoreUrl) {
    mobileUpdates.androidPlayStoreUrl = playStoreUrl;
  }

  if (Object.keys(mobileUpdates).length > 0) {
    mobileUpdates.updatedAt = new Date();
    await settings.updateOne(
      { _id: 'mobile' },
      { $set: mobileUpdates },
      { upsert: true },
    );
  }

  console.log(`Production settings migration complete (Android versionCode >= ${minimumAndroidVersionCode}; ${Object.keys(mobileUpdates).length} fields updated).`);
} finally {
  await client.close();
}
