'use client';

import { firebaseConfig as staticFirebaseConfig } from '@/firebase/config';
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Initializes the browser Firebase SDK once. Configuration changes take
 * effect on the next page load; deleting a live app while Auth is starting
 * can leave Firebase's component registry in an invalid state.
 */
export function initializeFirebase(config?: FirebaseOptions) {
  const activeConfig = config?.apiKey ? config : staticFirebaseConfig;
  const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(activeConfig);

  return getFirebaseServices(firebaseApp);
}

function getFirebaseServices(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}
