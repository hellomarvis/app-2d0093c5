/**
 * Password-reset email delivery. Three routes, tried in order:
 *
 *   1. The app's OWN Resend account — RESEND_API_KEY + RESEND_FROM (an address
 *      on a domain verified in Resend). Sent from here; plain fetch, no SDK.
 *   2. The platform (the default) — same path as the lead form. This backend
 *      SEALS the email (recipient + reset link) with APP_EMAIL_KEY, injected by
 *      the platform at build/deploy, and hands the sealed blob to the browser,
 *      which posts it to the platform (src/lib/passwordResetEmail.ts in the
 *      frontend). The browser can't read or alter what's inside; the platform
 *      opens it with the same key and sends through its Resend account.
 *   3. Neither configured (local dev) — the reset link is logged to the server
 *      console so the flow can still be completed by hand.
 *
 * Never throws: the caller always answers the user with the same generic
 * message, whether or not the account exists or the email went out.
 */
import crypto from 'crypto';
import config from '../../config';

export interface PasswordResetEmail {
  /** null = no such account: still sealed, so the response looks the same. */
  to: string | null;
  resetUrl: string;
  appName?: string;
}

/** What the forgot-password response carries back to the browser. */
export interface PasswordResetDelivery {
  /** Present when the browser must post it to the platform (route 2). */
  sealed?: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendViaResend(to: string, resetUrl: string, appName: string): Promise<void> {
  const minutes = config.passwordResetTtlMinutes;
  const url = escapeHtml(resetUrl);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${appName.replace(/[\r\n<>",;\\]/g, '')} <${config.resendFrom}>`,
      to: [to],
      subject: `Reset your ${appName} password`,
      html:
        `<p>We received a request to reset the password for your ${escapeHtml(appName)} account.</p>` +
        `<p><a href="${url}">Reset your password</a></p>` +
        `<p>Or paste this link into your browser:<br/>${url}</p>` +
        `<p>This link works once and expires in ${minutes} minutes. If you didn't ask for a reset, ignore this email.</p>`,
      text:
        `Reset your ${appName} password: ${resetUrl}\n\n` +
        `This link works once and expires in ${minutes} minutes. If you didn't ask for a reset, ignore this email.`,
    }),
  });
  if (!res.ok) console.error(`[mailer] Resend failed ${res.status}: ${await res.text().catch(() => '')}`);
}

/** AES-256-GCM, base64url(iv | tag | ciphertext) — the platform's format. */
function seal(payload: object): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(config.appEmailKey, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export async function preparePasswordResetEmail(msg: PasswordResetEmail): Promise<PasswordResetDelivery> {
  const appName = (msg.appName || '').trim().slice(0, 60) || 'Your account';
  try {
    if (config.resendApiKey && config.resendFrom) {
      if (msg.to) await sendViaResend(msg.to, msg.resetUrl, appName);
      return {};
    }
    if (config.appEmailKey) {
      return {
        sealed: seal({
          to: msg.to,
          resetUrl: msg.resetUrl,
          // The sealed blob is only good for a few minutes — enough for the
          // browser to post it, too short to be worth stealing.
          exp: Date.now() + 10 * 60_000,
          expiresInMinutes: config.passwordResetTtlMinutes,
        }),
      };
    }
    if (msg.to) console.info(`[mailer] no email provider configured — password reset link for ${msg.to}: ${msg.resetUrl}`);
    return {};
  } catch (error) {
    console.error('[mailer] password reset email failed:', error);
    return {};
  }
}
