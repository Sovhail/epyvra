export const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

import type { FirebaseOptions } from 'firebase/app';

export function isFirebaseConfigValid(config: Partial<FirebaseOptions> | null | undefined): boolean {
  if (!config) return false;
  return (
    typeof config.apiKey === 'string' &&
    Boolean(config.apiKey) &&
    typeof config.authDomain === 'string' &&
    Boolean(config.authDomain) &&
    typeof config.projectId === 'string' &&
    Boolean(config.projectId)
  );
}
