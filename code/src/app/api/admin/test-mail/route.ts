import { getErrorMessage } from '@/lib/error-utils';
import { NextRequest, NextResponse } from 'next/server';
import { createBrandedEmail, sendMail } from '@/lib/mailer';
import { verifyAdminSession } from '@/lib/actions/auth';

export async function POST(req: NextRequest) {
    try {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { to } = body;

        if (!to) {
            return NextResponse.json({ success: false, error: 'Recipient email is required.' }, { status: 400 });
        }

        const html = await createBrandedEmail({
            title: 'Email delivery is ready',
            previewText: 'Your EPYVRA SMTP configuration is working correctly.',
            bodyHtml: '<p style="margin:0 0 16px;">Hello,</p><p style="margin:0;">This test confirms that EPYVRA can send secure system emails from your configured support address.</p>',
        });

        await sendMail({
            to,
            subject: 'EPYVRA SMTP Test',
            html
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Test mail error:', e);
        return NextResponse.json({ success: false, error: getErrorMessage(e) || 'Failed to send test email.' }, { status: 500 });
    }
}
