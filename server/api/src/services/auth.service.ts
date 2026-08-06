import crypto from 'crypto';
import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { pool } from '../config/database';
import {
  cacheRevokedRefreshToken,
  isRefreshTokenRevokedInCache,
} from '../config/redis';

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AuthError';
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  googleId: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_url: string | null;
  subscription_tier: string;
  google_id: string | null;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult extends AuthTokens {
  user: PublicUser;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_AUTH_CALLBACK = 'http://localhost:8081/auth/callback';

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    subscriptionTier: row.subscription_tier,
    googleId: row.google_id,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new AuthError(500, 'JWT_ACCESS_SECRET is not configured');
  }
  return secret;
}

function getRefreshExpiryDate(): Date {
  const raw = process.env.JWT_REFRESH_EXPIRY || '7d';
  const match = /^(\d+)([dhms])$/.exec(raw);
  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  return new Date(Date.now() + amount * multipliers[unit]);
}

function signAccessToken(user: PublicUser): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_ACCESS_EXPIRY || '15m') as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
    },
    getAccessSecret(),
    options
  );
}

async function createRefreshToken(userId: string): Promise<string> {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = getRefreshExpiryDate();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return refreshToken;
}

async function issueTokens(user: PublicUser): Promise<AuthResult> {
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);
  return { accessToken, refreshToken, user };
}

export async function register(email: string, password: string): Promise<PublicUser> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new AuthError(400, 'Invalid email format');
  }
  if (password.length < 8) {
    throw new AuthError(400, 'Password must be at least 8 characters');
  }

  const existing = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [normalizedEmail]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AuthError(409, 'Email already registered');
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, email_verified)
     VALUES ($1, $2, false)
     RETURNING *`,
    [normalizedEmail, passwordHash]
  );

  return toPublicUser(result.rows[0]);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [normalizedEmail]
  );

  const user = result.rows[0];
  if (!user || !user.password_hash) {
    throw new AuthError(401, 'Invalid email or password');
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
    throw new AuthError(401, 'Invalid email or password');
  }

  return issueTokens(toPublicUser(user));
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  if (!refreshToken) {
    throw new AuthError(400, 'Refresh token is required');
  }

  const tokenHash = hashRefreshToken(refreshToken);

  if (await isRefreshTokenRevokedInCache(tokenHash)) {
    throw new AuthError(401, 'Refresh token has been revoked');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tokenResult = await client.query<{
      id: string;
      user_id: string;
      revoked: boolean;
      expires_at: Date;
    }>(
      `SELECT id, user_id, revoked, expires_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const stored = tokenResult.rows[0];
    if (!stored) {
      throw new AuthError(401, 'Invalid refresh token');
    }
    if (stored.revoked) {
      throw new AuthError(401, 'Refresh token has been revoked');
    }
    if (new Date(stored.expires_at).getTime() <= Date.now()) {
      throw new AuthError(401, 'Refresh token has expired');
    }

    await client.query(
      `UPDATE refresh_tokens SET revoked = true WHERE id = $1`,
      [stored.id]
    );

    const userResult = await client.query<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [stored.user_id]
    );
    const userRow = userResult.rows[0];
    if (!userRow) {
      throw new AuthError(401, 'User not found for refresh token');
    }

    const user = toPublicUser(userRow);
    const accessToken = signAccessToken(user);

    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const newHash = hashRefreshToken(newRefreshToken);
    const expiresAt = getRefreshExpiryDate();

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, newHash, expiresAt]
    );

    await client.query('COMMIT');
    return { accessToken, refreshToken: newRefreshToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function logout(refreshToken: string): Promise<void> {
  if (!refreshToken) {
    throw new AuthError(400, 'Refresh token is required');
  }

  const tokenHash = hashRefreshToken(refreshToken);
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked = true
     WHERE token_hash = $1`,
    [tokenHash]
  );
  await cacheRevokedRefreshToken(tokenHash);
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  if (!result.rows[0]) {
    throw new AuthError(404, 'User not found');
  }

  return toPublicUser(result.rows[0]);
}

export function getGoogleAuthUrl(state?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;
  if (!clientId || !redirectUri) {
    throw new AuthError(500, 'Google OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  if (state) {
    params.set('state', state);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getClientAuthCallbackUrl(tokens: AuthTokens): string {
  const url = new URL(CLIENT_AUTH_CALLBACK);
  url.searchParams.set('accessToken', tokens.accessToken);
  url.searchParams.set('refreshToken', tokens.refreshToken);
  return url.toString();
}

export async function handleGoogleCallback(code: string): Promise<AuthResult> {
  if (!code) {
    throw new AuthError(400, 'Authorization code is required');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AuthError(500, 'Google OAuth is not configured');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    console.error('[auth] Google token exchange failed:', detail);
    throw new AuthError(401, 'Failed to exchange Google authorization code');
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new AuthError(401, 'Google token response missing access_token');
  }

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!profileResponse.ok) {
    const detail = await profileResponse.text();
    console.error('[auth] Google userinfo failed:', detail);
    throw new AuthError(401, 'Failed to fetch Google user profile');
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
    verified_email?: boolean;
  };

  if (!profile.id || !profile.email) {
    throw new AuthError(401, 'Google profile missing required fields');
  }

  const email = profile.email.trim().toLowerCase();

  const byGoogle = await pool.query<UserRow>(
    'SELECT * FROM users WHERE google_id = $1',
    [profile.id]
  );

  if (byGoogle.rows[0]) {
    return issueTokens(toPublicUser(byGoogle.rows[0]));
  }

  const byEmail = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (byEmail.rows[0]) {
    const linked = await pool.query<UserRow>(
      `UPDATE users
       SET google_id = $1,
           email_verified = true,
           display_name = COALESCE(display_name, $2),
           avatar_url = COALESCE(avatar_url, $3),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [profile.id, profile.name ?? null, profile.picture ?? null, byEmail.rows[0].id]
    );
    return issueTokens(toPublicUser(linked.rows[0]));
  }

  const created = await pool.query<UserRow>(
    `INSERT INTO users (
       email, password_hash, display_name, avatar_url, google_id, email_verified
     ) VALUES ($1, NULL, $2, $3, $4, true)
     RETURNING *`,
    [email, profile.name ?? null, profile.picture ?? null, profile.id]
  );

  return issueTokens(toPublicUser(created.rows[0]));
}
