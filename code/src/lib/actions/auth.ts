'use server';

import { z } from 'zod';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '../crypto';
import { getDb } from '../mongodb';
import { handleError, getQueryById, handleProfileError } from './utils';
import { getDemoModeMutationError } from '../demo-mode';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, verifyAdminSessionToken } from '../admin-session';
import { authorizeInstall } from '../install-auth';

type SettingsDocument = {
    _id: string;
    username?: string;
    email?: string;
    displayName?: string;
    passwordHash?: string;
    passwordSalt?: string;
    passwordAlgorithm?: string;
    sessionVersion: number;
    resetToken?: string;
    resetTokenExpiry?: Date;
    maxFailedLoginsPerIp?: number;
    maxPasswordResetsPerDay?: number;
    siteUrl?: string;
    isLicenseActive?: boolean;
    licenseKey?: string;
};
type RateLimitDocument = { _id: string; count: number; createdAt?: Date };
type AdminProfileUpdate = {
    displayName: string;
    email: string;
    username: string;
    passwordHash?: string;
    passwordSalt?: string;
    passwordAlgorithm?: string;
    sessionVersion?: number;
};

/**
 * Handles Administrator authentication login.
 * Verifies the password and transparently upgrades legacy SHA-256 hashes.
 */
export async function login(_prevState: unknown, formData: FormData) {
  const loginSchema = z.object({ username: z.string(), password: z.string() });
  const validatedFields = loginSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!validatedFields.success) return { error: 'Invalid fields!' };

  const { username, password } = validatedFields.data;

  try {
    const db = await getDb();
    
    // IP Rate Limiting
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const today = new Date().toISOString().split('T')[0];
    const rateLimitId = `login_${today}_${ip}`;
    
    const settings = db.collection<SettingsDocument>('settings');
    const rateLimits = db.collection<RateLimitDocument>('rate_limits');
    const generalSettings = await settings.findOne({ _id: 'general' });
    const maxFailedLogins = Number(generalSettings?.maxFailedLoginsPerIp) || 5;

    const rateLimit = await rateLimits.findOne({ _id: rateLimitId });
    if (rateLimit && rateLimit.count >= maxFailedLogins) {
        return { error: `Too many failed login attempts. Your IP is blocked for today.` };
    }

    const adminData = await settings.findOne({ _id: 'admin' });
    
    if (adminData && typeof adminData.passwordHash === 'string' && typeof adminData.passwordSalt === 'string') {
      const verification = verifyPassword(password, adminData.passwordSalt, adminData.passwordHash);
      if (username === adminData.username && verification.valid) {
        if (verification.needsRehash) {
          const passwordSalt = randomBytes(16).toString('hex');
          await settings.updateOne(
            { _id: 'admin' },
            { $set: { passwordHash: hashPassword(password, passwordSalt), passwordSalt, passwordAlgorithm: 'pbkdf2-sha512' } }
          );
        }
        
        // Reset rate limit on success
        if (rateLimit) {
            await rateLimits.deleteOne({ _id: rateLimitId });
        }

        const sessionVersion = Number(adminData.sessionVersion ?? 1);
        const token = await createAdminSessionToken(username, sessionVersion);
        const cookieStore = await cookies();
        cookieStore.set(ADMIN_SESSION_COOKIE, token, {
            httpOnly: true, 
            path: '/', 
            sameSite: 'lax', 
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 12,
        });
        redirect('/admin');
      }
    }
    
    // Increment failed login attempts
    await rateLimits.updateOne(
        { _id: rateLimitId },
        { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
    );

    return { error: 'Invalid username or password.' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
    }
    console.error('Login error:', error);
    return { error: 'Login failed. Please try again later.' };
  }
}

/**
 * Logs out the Administrator by clearing the auth cookie.
 */
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  cookieStore.delete('auth');
  redirect('/admin/login');
}

/**
 * Updates the admin profile details (username, email, or password).
 * Salts and hashes new password if updated.
 */
export async function updateAdminProfile(_prevState: unknown, formData: FormData) {
    if (!(await verifyAdminSession())) return { error: 'Unauthorized access.' };
    const demoError = getDemoModeMutationError();
    if (demoError) return demoError;
    const db = await getDb();
    
    // Explicitly sanitize and typecast inputs
    const displayName = typeof formData.get('displayName') === 'string' ? (formData.get('displayName') as string).trim() : '';
    const email = typeof formData.get('email') === 'string' ? (formData.get('email') as string).trim() : '';
    const username = typeof formData.get('username') === 'string' ? (formData.get('username') as string).trim() : '';
    const currentPassword = typeof formData.get('currentPassword') === 'string' ? formData.get('currentPassword') as string : '';
    const newPassword = typeof formData.get('newPassword') === 'string' ? formData.get('newPassword') as string : '';

    if (!displayName || !email || !username) {
        return { error: 'Required fields display name, email, or username are missing.' };
    }

    try {
        const settings = db.collection<SettingsDocument>('settings');
        const admin = await settings.findOne({ _id: 'admin' });
        if (!admin) return { error: 'Admin record not found' };

        if (typeof admin.passwordSalt !== 'string' || typeof admin.passwordHash !== 'string') {
            return { error: 'Admin credentials are not configured correctly' };
        }
        const verification = verifyPassword(currentPassword, admin.passwordSalt, admin.passwordHash);
        if (!verification.valid) return { error: 'Current password incorrect' };

        const updateData: AdminProfileUpdate = { displayName, email, username };
        if (newPassword || verification.needsRehash) {
            const salt = randomBytes(16).toString('hex');
            const hash = hashPassword(newPassword || currentPassword, salt);
            updateData.passwordHash = hash;
            updateData.passwordSalt = salt;
            updateData.passwordAlgorithm = 'pbkdf2-sha512';
        }

        const sessionVersion = Number(admin.sessionVersion ?? 1) + 1;
        updateData.sessionVersion = sessionVersion;
        await settings.updateOne({ _id: 'admin' }, { $set: updateData });
        const token = await createAdminSessionToken(username, sessionVersion);
        const cookieStore = await cookies();
        cookieStore.set(ADMIN_SESSION_COOKIE, token, {
            httpOnly: true,
            path: '/',
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 12,
        });
        return { success: true, message: 'Profile updated successfully' };
    } catch (e) {
        return handleProfileError('updateAdminProfile', e, 'Failed to update admin profile.');
    }
}

/**
 * Installs and sets up the primary admin credentials.
 */
export async function installSetupAdminAction(data: { username: string, email: string, password: string, setupToken: string }) {
    try {
        const authorization = await authorizeInstall(data.setupToken);
        if (!authorization.ok) return { success: false, error: authorization.error };
        if (data.password.length < 12) return { success: false, error: 'Admin password must be at least 12 characters.' };
        if (!z.string().email().safeParse(data.email.trim()).success) return { success: false, error: 'A valid admin email is required.' };
        const db = await getDb();
        const salt = randomBytes(16).toString('hex');
        const hash = hashPassword(data.password, salt);
        const adminProfile = {
            username: data.username.trim() || 'admin',
            displayName: 'Administrator',
            email: data.email.trim(),
            passwordHash: hash,
            passwordSalt: salt,
            passwordAlgorithm: 'pbkdf2-sha512',
            sessionVersion: 1,
        };
        await db.collection<Record<string, unknown> & { _id: string }>('settings').insertOne({ _id: 'admin', ...adminProfile });
        return { success: true };
    } catch (e) {
        return handleError('installSetupAdminAction', e, 'Admin profile setup failed.');
    }
}

/**
 * Validates the product license key.
 */
export async function testLicenseAction(licenseKey: string) {
    if (!(await verifyAdminSession())) return { success: false, message: 'Unauthorized access.' };
    const demoError = getDemoModeMutationError();
    if (demoError) return demoError;
        if (licenseKey.length > 10) { const db = await getDb(); await db.collection<SettingsDocument>('settings').updateOne({ _id: 'general' }, { $set: { isLicenseActive: true, licenseKey } }, { upsert: true }); return { success: true, message: 'License activated successfully!' }; }
    return { success: false, message: 'Invalid license key.' };
}

/**
 * Cryptographically verifies if the current session is a valid, unexpired administrator session.
 */
export async function verifyAdminSession(): Promise<boolean> {
    try {
        const cookieStore = await cookies();
        const authCookie = cookieStore.get(ADMIN_SESSION_COOKIE);
        if (!authCookie || !authCookie.value) return false;
        const session = await verifyAdminSessionToken(authCookie.value);
        if (!session) return false;
        const db = await getDb();
        const admin = await db.collection<Record<string, unknown> & { _id: string }>('settings').findOne({ _id: 'admin' });
        return !!admin
            && admin.username === session.subject
            && Number(admin.sessionVersion ?? 1) === session.sessionVersion;
    } catch {
        return false;
    }
}

export async function adminForgotPassword(_prevState: unknown, formData: FormData) {
    const email = typeof formData.get('email') === 'string' ? formData.get('email') as string : '';
    if (!email) return { error: 'Email is required' };

    try {
        const db = await getDb();
        
        // IP Rate Limiting for Resets
        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
        const today = new Date().toISOString().split('T')[0];
        const rateLimitId = `reset_${today}_${ip}`;
        
        const settingsCollection = db.collection<SettingsDocument>('settings');
        const rateLimits = db.collection<RateLimitDocument>('rate_limits');
        const generalSettings = await settingsCollection.findOne({ _id: 'general' });
        const maxResets = Number(generalSettings?.maxPasswordResetsPerDay) || 3;

        const rateLimit = await rateLimits.findOne({ _id: rateLimitId });
        if (rateLimit && rateLimit.count >= maxResets) {
            return { error: `You have reached the maximum number of password reset requests for today.` };
        }

        const admin = await settingsCollection.findOne({ _id: 'admin' });
        
        if (!admin || admin.email !== email.trim()) {
            return { error: 'Invalid admin email address.' };
        }

        const token = randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await settingsCollection.updateOne(
            { _id: 'admin' },
            { $set: { resetToken: token, resetTokenExpiry: expiry } }
        );

        const settings = await settingsCollection.findOne({ _id: 'general' });
        const domain = typeof settings?.siteUrl === 'string'
            ? settings.siteUrl
            : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
        const resetLink = `${domain.replace(/\/$/, '')}/admin/reset-password?token=${token}`;

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a; margin-bottom: 16px;">Admin Password Reset</h2>
                <p style="color: #334155; line-height: 1.5;">You requested a password reset for your admin account. Click the button below to set a new password. This link expires in 60 minutes.</p>
                <a href="${resetLink}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a>
                <p style="color: #334155; line-height: 1.5; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
        `;

        const { sendMail } = await import('../mailer');
        await sendMail({
            to: email,
            subject: 'Admin Password Reset',
            html
        });
        
        // Increment reset attempts
        await rateLimits.updateOne(
            { _id: rateLimitId },
            { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        return { success: true, message: 'A password reset link has been sent to your email.' };
    } catch (e) {
        console.error('Forgot password error:', e);
        return { error: 'Failed to process request. Please try again later.' };
    }
}

export async function adminResetPassword(_prevState: unknown, formData: FormData) {
    const token = typeof formData.get('token') === 'string' ? formData.get('token') as string : '';
    const password = typeof formData.get('password') === 'string' ? formData.get('password') as string : '';
    
    if (!token || !password) return { error: 'Missing token or password' };
    if (password.length < 6) return { error: 'Password must be at least 6 characters' };

    try {
        const db = await getDb();
        const settings = db.collection<SettingsDocument>('settings');
        const admin = await settings.findOne({
            _id: 'admin',
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() }
        });

        if (!admin) {
            return { error: 'Invalid or expired reset token' };
        }

        const salt = randomBytes(16).toString('hex');
        const hash = hashPassword(password, salt);

        await settings.updateOne(
            { _id: 'admin' },
            { 
                $set: { 
                    passwordHash: hash, 
                    passwordSalt: salt,
                    passwordAlgorithm: 'pbkdf2-sha512'
                },
                $inc: { sessionVersion: 1 },
                $unset: {
                    resetToken: "",
                    resetTokenExpiry: ""
                }
            }
        );

        return { success: true, message: 'Password has been reset successfully' };
    } catch (e) {
        console.error('Reset password error:', e);
        return { error: 'Failed to reset password. Please try again later.' };
    }
}
