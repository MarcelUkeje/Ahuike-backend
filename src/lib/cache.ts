import { Redis } from '@upstash/redis';

/** Lazily-created Upstash Redis REST client. Returns null when env vars are absent (dev/test). */
let _redis: Redis | null = null;

export function getCache(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) {
    _redis = new Redis({ url, token });
  }
  return _redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getCache();
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getCache();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // cache failures must never break the request
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getCache();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}
