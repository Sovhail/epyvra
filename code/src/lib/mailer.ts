import nodemailer from 'nodemailer';
import { getServerGeneralSettings as getGeneralSettings } from './server-settings';

type BrandedEmailOptions = {
    title: string;
    previewText: string;
    bodyHtml: string;
    action?: { label: string; href: string };
};

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    })[character] ?? character);
}

function safeImageUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

/** Creates a client-safe, responsive brand wrapper for transactional emails. */
export async function createBrandedEmail({ title, previewText, bodyHtml, action }: BrandedEmailOptions) {
    const settings = await getGeneralSettings();
    const siteName = escapeHtml(settings?.siteName || 'EPYVRA');
    const logoUrl = safeImageUrl(settings?.logoUrl);
    const safeAction = action && /^https:\/\//.test(action.href) ? action : undefined;
    const logo = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="${siteName}" style="display:block;width:48px;height:48px;object-fit:contain;border:0;outline:none;text-decoration:none;" />`
        : `<div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#ffffff;font-size:18px;font-weight:800;line-height:48px;text-align:center;">E</div>`;
    const actionButton = safeAction
        ? `<tr><td style="padding:8px 32px 28px;"><a href="${escapeHtml(safeAction.href)}" style="display:inline-block;background:#a855f7;border-radius:10px;color:#ffffff;font-size:16px;font-weight:700;line-height:20px;padding:14px 22px;text-decoration:none;">${escapeHtml(safeAction.label)}</a></td></tr>`
        : '';

    return `<!doctype html>
<html lang="en">
  <head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
  <body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ff;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(76,29,149,.12);">
          <tr><td style="padding:28px 32px 24px;background:linear-gradient(135deg,#140b2d,#32115f);">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="padding-right:14px;vertical-align:middle;">${logo}</td>
              <td style="vertical-align:middle;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.3px;">${siteName}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:32px 32px 12px;color:#1e1b4b;font-size:26px;font-weight:800;line-height:34px;">${escapeHtml(title)}</td></tr>
          <tr><td style="padding:0 32px 20px;color:#475569;font-size:16px;line-height:25px;">${bodyHtml}</td></tr>
          ${actionButton}
          <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:18px;">This is an automated message from ${siteName}. Please do not reply to this email.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

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
