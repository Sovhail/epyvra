import { getErrorMessage, hasErrorCode } from '@/lib/error-utils';
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import { createBrandedEmail, sendMail } from '@/lib/mailer';
import { getDb } from '@/lib/mongodb';

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        
        if (!email) {
            return NextResponse.json({ success: false, error: 'Email is required.' }, { status: 400 });
        }

        // IP Rate Limiting
        const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
        const today = new Date().toISOString().split('T')[0];
        const rateLimitId = `reset_${today}_${ip}`;
        
        const db = await getDb();
        const generalSettings = await db.collection<Record<string, unknown> & { _id: string }>('settings').findOne({ _id: 'general' });
        const maxResets = Number(generalSettings?.maxPasswordResetsPerDay) || 3;

        const rateLimits = db.collection<{ _id: string; count: number; createdAt?: Date }>('rate_limits');
        const rateLimit = await rateLimits.findOne({ _id: rateLimitId });
        if (rateLimit && rateLimit.count >= maxResets) {
            return NextResponse.json({ success: false, error: 'You have reached the maximum number of password reset requests for today.' }, { status: 429 });
        }

        const admin = await getFirebaseAdmin();
        const resetLink = await admin.auth().generatePasswordResetLink(email);

        const html = await createBrandedEmail({
            title: 'Reset your password',
            previewText: 'Use this secure link to reset your EPYVRA password.',
            bodyHtml: '<p style="margin:0 0 16px;">We received a request to reset your password.</p><p style="margin:0;">If you did not make this request, you can safely ignore this email.</p>',
            action: { label: 'Reset password', href: resetLink },
        });

        await sendMail({
            to: email,
            subject: 'Reset your password',
            html
        });
        
        // Increment reset attempts
        await rateLimits.updateOne(
            { _id: rateLimitId },
            { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );

        return NextResponse.json({ success: true, message: 'If the email exists, a reset link has been sent.' });

    } catch (e) {
        console.error('Forgot password API error:', e);
        // Do not leak if user exists or not, standard security practice, unless it's a specific auth error we want to expose.
        if (hasErrorCode(e, 'auth/user-not-found')) {
            return NextResponse.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
        }
        return NextResponse.json({ success: false, error: getErrorMessage(e) || 'Failed to send password reset email.' }, { status: 500 });
    }
}
