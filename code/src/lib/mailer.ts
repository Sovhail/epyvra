import nodemailer from 'nodemailer';
import { getServerGeneralSettings as getGeneralSettings } from './server-settings';

export async function sendMail({ to, subject, html }: { to: string, subject: string, html: string }) {
    const settings = await getGeneralSettings();
    
    let transporter;
    
    if (settings?.mailType === 'sendmail') {
        transporter = nodemailer.createTransport({
            sendmail: true,
            newline: 'unix',
            path: '/usr/sbin/sendmail'
        });
    } else {
        if (!settings || !settings.smtpHost || !settings.smtpUser) {
            throw new Error('SMTP configuration is missing. Please configure it in Admin Settings.');
        }

        const secure = settings.smtpEncryption === 'ssl';
        
        transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort || (secure ? 465 : 587),
            secure: secure,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
            // Fail promptly with a useful API error when a provider, port, or
            // credential is misconfigured instead of leaving the admin UI waiting.
            connectionTimeout: 15_000,
            greetingTimeout: 15_000,
            socketTimeout: 30_000,
        });
    }

    const fromName = settings.siteName || 'EPYVRA';
    const fromEmail = settings.supportEmail || settings.smtpUser || 'noreply@epyvra.com';

    const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: to,
        subject: subject,
        html: html,
    });

    return info;
}
