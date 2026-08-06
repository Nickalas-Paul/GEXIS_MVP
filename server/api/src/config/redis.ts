import './env';
import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

export let redisReady = false;

redis.on('error', (err) => {
  console.error('[redis] Client error:', err);
});

export async function connectRedis(): Promise<boolean> {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected ping response: ${String(pong)}`);
    }
    redisReady = true;
    console.log('[redis] Connected successfully');
    return true;
  } catch (err) {
    redisReady = false;
    console.error('[redis] Connection failed:', err);
    return false;
  }
}

const REVOKED_TTL_SECONDS = 604800; // 7 days

export async function cacheRevokedRefreshToken(tokenHash: string): Promise<void> {
  try {
    if (!redis.isOpen) {
      return;
    }
    await redis.set(`revoked:${tokenHash}`, '1', { EX: REVOKED_TTL_SECONDS });
  } catch (err) {
    console.error('[redis] Failed to cache revoked token:', err);
  }
}

export async function isRefreshTokenRevokedInCache(tokenHash: string): Promise<boolean> {
  try {
    if (!redis.isOpen) {
      return false;
    }
    const value = await redis.get(`revoked:${tokenHash}`);
    return value !== null;
  } catch (err) {
    console.error('[redis] Revocation cache lookup failed:', err);
    return false;
  }
}
