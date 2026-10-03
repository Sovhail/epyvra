export const firebaseConfig = {
  "projectId": "",
  "appId": "",
  "apiKey": "",
  "authDomain": "",
  "measurementId": "",
  "messagingSenderId": ""
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
