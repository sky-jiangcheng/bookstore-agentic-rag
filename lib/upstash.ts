// lib/upstash.ts
import { Redis } from '@upstash/redis';
import { hasRedisConfig } from '@/lib/config/environment';

/** Lazy singleton: Upstash Redis client, null when unconfigured or URL invalid */
export const redis: Redis | null = (() => {
  if (!hasRedisConfig()) return null;
  try {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });
  } catch {
    return null;
  }
})();
