import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFile } from 'node:fs/promises';
import { getServerGeneralSettings as getGeneralSettings } from './server-settings';

let initialized = false;

async function getConfiguredServiceAccount(): Promise<unknown> {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
    if (serviceAccountPath) {
        return JSON.parse(await readFile(serviceAccountPath, 'utf8')) as unknown;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (serviceAccountJson) {
        return JSON.parse(serviceAccountJson) as unknown;
    }

    const settings = await getGeneralSettings();
    return settings?.firebaseServiceAccount;
}

export async function getFirebaseAdmin() {
    if (initialized && getApps().length > 0) {
        return { auth: () => getAuth() };
    }

    const configuredAccount = await getConfiguredServiceAccount();
    if (!configuredAccount) {
        throw new Error('Firebase Service Account is not configured.');
    }

    try {
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
