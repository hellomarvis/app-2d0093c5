import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config';
import User from '../models/user';
import { preparePasswordResetEmail } from '../lib/mailer';

async function login(req: Request, res: Response): Promise<any> {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.getUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'This account is suspended.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, isAdmin: user.isAdmin === true },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    const { password: _password, passwordResetTokenHash: _rt, passwordResetExpiresAt: _rx, ...safeUser } = user;
    return res.json({ user: safeUser, token });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
}

async function signup(req: Request, res: Response): Promise<any> {
  const { email, password, displayName, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const existingUser = await User.getUserByEmail(email);
    if (existingUser) return res.status(409).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // tenantId: in the MVP generator, override this with the project's tenant identifier.
    // Default: 'default' for single-tenant use. Extend by reading from req.headers['x-tenant-id'].
    const tenantId = (req.headers['x-tenant-id'] as string) ?? 'default';
    const safeRole = role === 'developer' ? 'developer' : 'professional';
    const safeDisplayName =
      typeof displayName === 'string' && displayName.trim().length >= 2 ? displayName.trim().slice(0, 50) : email.split('@')[0];

    const user = await User.createUser({
      email,
      password: hashedPassword,
      tenantId,
      displayName: safeDisplayName,
      role: safeRole,
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, tenantId: user.tenantId, isAdmin: user.isAdmin === true },
      config.jwtSecret,
      { expiresIn: '7d' },
    );

    const { password: _password, passwordResetTokenHash: _rt, passwordResetExpiresAt: _rx, ...safeUser } = user;
    return res.json({ user: safeUser, token });
  } catch (error) {
    console.error('Error during signup:', error);
    return res.status(500).json({ message: 'Registration failed' });
  }
}

// Change the authenticated user's password. Requires the current password.
// Mounted behind jwtCheck, so req.user.id is the actor.
async function changePassword(req: Request, res: Response): Promise<any> {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }

  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const user = await User.getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) return res.status(400).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.updatePassword(user.id, hashed);
    return res.json({ message: 'Password updated' });
  } catch (error) {
    console.error('Error during change-password:', error);
    return res.status(500).json({ message: 'Password change failed' });
  }
}

// ─── Forgot password ────────────────────────────────────────────────────────
// 1. POST /forgot-password { email, appName? } — mints a one-time token, stores
//    only its SHA-256, and prepares the email with the link
//    {APP_PUBLIC_URL}/reset-password?token=… (the browser hands it to the
//    platform to send, like the lead form — see lib/mailer.ts).
// 2. POST /reset-password { token, password } — checks hash + expiry, sets the
//    new password and burns the token.
// The forgot step answers the SAME message whether or not the email exists, so
// it can't be used to discover who has an account.

const FORGOT_PASSWORD_MESSAGE = 'If an account exists for that email, a password reset link is on its way.';

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Where the frontend lives. APP_PUBLIC_URL (set by the platform) wins; the
 *  request-derived fallback only exists for plain local dev. */
function frontendBaseUrl(req: Request): string {
  if (config.appPublicUrl) return config.appPublicUrl;
  const origin = req.get('origin');
  if (origin) return `${origin.replace(/\/+$/, '')}${config.appBasePath}`;
  return `${req.protocol}://${req.get('host')}${config.appBasePath}`;
}

async function forgotPassword(req: Request, res: Response): Promise<any> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const appName = typeof req.body?.appName === 'string' ? req.body.appName : undefined;

  try {
    const user = await User.getUserByEmail(email);
    let resetUrl = `${frontendBaseUrl(req)}/reset-password`;
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + config.passwordResetTtlMinutes * 60_000);
      await User.setPasswordResetToken(user.id, hashResetToken(token), expiresAt);
      resetUrl = `${resetUrl}?token=${token}`;
    }

    // Unknown email: still prepared (sealed with no recipient) so the response
    // has the same shape either way. `sealed`, when present, is what the
    // frontend posts to the platform to send the email (see lib/mailer.ts).
    const delivery = await preparePasswordResetEmail({ to: user ? user.email : null, resetUrl, appName });
    return res.json({ message: FORGOT_PASSWORD_MESSAGE, ...delivery });
  } catch (error) {
    console.error('Error during forgot-password:', error);
    return res.status(500).json({ message: 'Could not start password reset' });
  }
}

async function resetPassword(req: Request, res: Response): Promise<any> {
  const { token, password } = req.body ?? {};

  if (typeof token !== 'string' || !token || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const user = await User.getUserByPasswordResetTokenHash(hashResetToken(token));
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired. Request a new one.' });
    }

    await User.resetPassword(user.id, await bcrypt.hash(password, 10));
    return res.json({ message: 'Your password has been reset. You can sign in now.' });
  } catch (error) {
    console.error('Error during reset-password:', error);
    return res.status(500).json({ message: 'Password reset failed' });
  }
}

export default { login, signup, changePassword, forgotPassword, resetPassword };
