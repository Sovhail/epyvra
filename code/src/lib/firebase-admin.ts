import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getServerGeneralSettings as getGeneralSettings } from './server-settings';

let initialized = false;

export async function getFirebaseAdmin() {
    if (initialized && getApps().length > 0) {
        return { auth: () => getAuth() };
    }

    const settings = await getGeneralSettings();
    if (!settings?.firebaseServiceAccount) {
        throw new Error('Firebase Service Account JSON is not configured in Admin Settings.');
    }

    try {
        const configuredAccount: unknown = settings.firebaseServiceAccount;
        let parsedAccount: unknown;

        if (typeof configuredAccount === 'string') {
            parsedAccount = JSON.parse(configuredAccount);
        } else if (typeof configuredAccount === 'object') {
            parsedAccount = configuredAccount;
        } else {
            throw new Error('Invalid format for Firebase Service Account.');
        }

        if (!parsedAccount || typeof parsedAccount !== 'object') {
            throw new Error('Invalid Firebase Service Account object.');
        }
        const candidate = parsedAccount as Record<string, unknown>;
        const projectId = candidate.project_id ?? candidate.projectId;
        const clientEmail = candidate.client_email ?? candidate.clientEmail;
        const privateKey = candidate.private_key ?? candidate.privateKey;
        if (typeof projectId !== 'string' || typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
            throw new Error('Firebase Service Account is missing required fields.');
        }
        const serviceAccount: ServiceAccount = {
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
        };

        // Initialize admin if not already initialized
        if (getApps().length === 0) {
            initializeApp({
                credential: cert(serviceAccount)
            });
        }
        
        initialized = true;
        return { auth: () => getAuth() };
    } catch (e: unknown) {
        console.error('Failed to initialize Firebase Admin SDK:', e);
        const message = e instanceof Error ? e.message : String(e);
        throw new Error('Invalid Firebase Service Account JSON: ' + message);
    }
}
