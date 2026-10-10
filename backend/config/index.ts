import dotenv from 'dotenv';
dotenv.config();

const jwtSecret = process.env.JWT_SECRET_KEY;
if (!jwtSecret) {
  console.warn('WARNING: JWT_SECRET_KEY not set — using insecure default. Set it in production!');
}

const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: jwtSecret || 'dev_secret_key_change_in_production',
  // DATABASE_URL is read directly by Prisma from .env — no need to pass it manually

  // ─── Image uploads via the platform upload proxy ──────────────────────────
  // The app holds NO AWS credentials. Admin image uploads are forwarded to the
  // platform's upload proxy (POST {proxy}/v1/projects/{projectId}/uploads) with
  // a scoped token; the platform writes to S3 under projects/{projectId}/admin/
  // using its own creds. All three are injected by the platform at build/deploy.
  // When any is unset, /api/uploads returns a "not configured" error.
  mediaProxyUrl: (process.env.MEDIA_UPLOAD_PROXY_URL || '').replace(/\/+$/, ''),
  mediaUploadToken: process.env.MEDIA_UPLOAD_TOKEN || '',
  projectId: process.env.PROJECT_ID || '',

  // ─── Password-reset email ─────────────────────────────────────────────────
  // appPublicUrl is where the frontend is served (injected by the platform; it
  // already includes any base path) — reset links are built from it, never
  // from request headers, so a forged Host can't redirect a reset token.
  // Mail goes out through, in order: the app's own Resend key (RESEND_API_KEY
  // + RESEND_FROM on a domain verified in Resend), else the platform — like
  // the lead form: the backend seals the email with APP_EMAIL_KEY (injected at
  // build/deploy) and the browser posts the sealed blob to the platform.
  // With neither, the reset link is logged to the server console instead.
  appPublicUrl: (process.env.APP_PUBLIC_URL || '').replace(/\/+$/, ''),
  appBasePath: (process.env.APP_BASE_PATH || '').replace(/\/+$/, ''),
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || '',
  appEmailKey: process.env.APP_EMAIL_KEY || '',
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 60,
};

export default config;
