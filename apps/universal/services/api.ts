/**
 * Resolve the API base URL for the current platform.
 *
 * - Prefer EXPO_PUBLIC_API_URL (set in apps/universal/.env).
 * - On native, localhost is unreachable from a physical device — fall back to
 *   EXPO_PUBLIC_API_URL_LAN if provided, otherwise keep the env value and warn.
 * - On web, localhost is fine; LAN IP also works from the same machine.
 */
import { Platform } from 'react-native';

const ENV_URL = process.env.EXPO_PUBLIC_API_URL || '';
const ENV_LAN_URL = process.env.EXPO_PUBLIC_API_URL_LAN || '';

function isLocalhost(url: string): boolean {
  return /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}

export function resolveApiUrl(): string {
  const primary = ENV_URL.trim() || 'http://localhost:3001';

  if (Platform.OS === 'web') {
    return primary;
  }

  // Native: prefer non-localhost URL so physical devices can reach the API
  if (!isLocalhost(primary)) {
    return primary;
  }
  if (ENV_LAN_URL.trim()) {
    return ENV_LAN_URL.trim();
  }

  if (__DEV__) {
    console.warn(
      '[api] EXPO_PUBLIC_API_URL is localhost; set a LAN IP (e.g. http://192.168.x.x:3001) for device testing.'
    );
  }
  return primary;
}

const API_URL = resolveApiUrl();

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  googleId: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: AuthUser;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`;
  try {
    const data = (await response.json()) as { error?: string };
    if (data?.error) {
      message = data.error;
    }
  } catch {
    // ignore JSON parse errors
  }
  return new ApiError(response.status, message);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getApiUrl(): string {
  return API_URL;
}

export async function register(
  email: string,
  password: string
): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken(token: string): Promise<AuthTokens> {
  return request<AuthTokens>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export async function logout(token: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export async function getMe(accessToken: string): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/api/auth/me', { method: 'GET' }, accessToken);
}

export type SubscriptionTierName = 'free' | 'pro' | 'marketplace';

/** Dev-only: update the current user's subscription_tier (non-production API). */
export async function setDevTier(
  accessToken: string,
  tier: SubscriptionTierName
): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>(
    '/api/dev/set-tier',
    {
      method: 'POST',
      body: JSON.stringify({ tier }),
    },
    accessToken
  );
}
