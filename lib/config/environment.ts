import 'server-only';

export const config = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || '',
    model: process.env.OPENAI_MODEL || '',
  },
  database: {
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
  },
  upstash: {
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  services: {
    authUrl: process.env.AUTH_SERVICE_URL || '',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  rag: {
    defaultTargetCount: 15,
  },
  // Vercel Deployment
  vercel: {
    enabled: process.env.VERCEL === 'true' || process.env.VERCEL_ENV !== undefined,
    timeout: Number(process.env.VERCEL_TIMEOUT) || 7000, // 7 seconds (under 10s limit with cold start headroom)
  },
  feedback: {
    enabled: process.env.ENABLE_FEEDBACK !== 'false',
    storage: process.env.FEEDBACK_STORAGE || 'redis',
  },
  conversation: {
    enabled: process.env.ENABLE_CONVERSATION_MEMORY !== 'false',
    ttl: Number(process.env.CONVERSATION_TTL) || 3600,
    maxTurns: Number(process.env.MAX_CONVERSATION_TURNS) || 20,
  },
} as const;

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.google.apiKey) missing.push('GOOGLE_API_KEY');
  if (!config.database.url) missing.push('POSTGRES_URL or DATABASE_URL');

  if (missing.length > 0) {
    console.warn(`[config] Missing environment variables: ${missing.join(', ')}. Some features may not work.`);
  }
}

export function hasDatabaseConfig(): boolean {
  return Boolean(config.database.url);
}

export function hasRedisConfig(): boolean {
  return Boolean(config.upstash.redisUrl && config.upstash.redisToken);
}

export default config;
