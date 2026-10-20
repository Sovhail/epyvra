'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';
import type { GeneralSettings } from '@/lib/types';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

interface FirebaseClientProviderProps {
  children: ReactNode;
  lang: string;
  settings?: GeneralSettings | null;
}

export function FirebaseClientProvider({
  children,
  settings,
}: FirebaseClientProviderProps) {
  const config = useMemo(() => settings?.firebaseApiKey ? {
        apiKey: settings.firebaseApiKey,
        authDomain: settings.firebaseAuthDomain,
        projectId: settings.firebaseProjectId,
        storageBucket: settings.firebaseStorageBucket,
        messagingSenderId: settings.firebaseMessagingSenderId,
        appId: settings.firebaseAppId,
        measurementId: settings.firebaseMeasurementId,
    } : undefined, [settings]);
  const [firebaseServices, setFirebaseServices] = useState<FirebaseServices | null>(null);

  useEffect(() => {
    // Firebase Auth's browser component registry is unavailable during React
    // server rendering. Initializing here keeps SSR deterministic and starts
    // Auth/Firestore as soon as the page hydrates in the browser.
    setFirebaseServices(initializeFirebase(config));
  }, [config]);

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices?.firebaseApp ?? null}
      auth={firebaseServices?.auth ?? null}
      firestore={firebaseServices?.firestore ?? null}
    >
      {children}
    </FirebaseProvider>
  );
}
