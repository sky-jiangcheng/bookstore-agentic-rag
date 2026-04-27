export const config = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
  },
  database: {
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
  },
  upstash: {
    vectorUrl: process.env.UPSTASH_VECTOR_REST_URL || '',
    vectorToken: process.env.UPSTASH_VECTOR_REST_TOKEN || '',
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  services: {
    authUrl: process.env.AUTH_SERVICE_URL || '',
    catalogUrl: process.env.CATALOG_SERVICE_URL || '',
  },
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  rag: {
    maxIterations: 3,
    defaultTargetCount: 15,
    qualityThreshold: 0.8,
  },
  // Vercel Deployment
  vercel: {
    enabled: process.env.VERCEL === 'true' || process.env.VERCEL_ENV !== undefined,
    timeout: Number(process.env.VERCEL_TIMEOUT) || 9000, // 9 seconds (under 10s limit)
    useSimplifiedPipeline: process.env.VERCEL_USE_SIMPLIFIED !== 'false',
  },
  // Classic RAG Components
  chunking: {
    strategy: (process.env.CHUNKING_STRATEGY as 'fixed' | 'semantic' | 'book-specific') || 'book-specific',
    chunkSize: Number(process.env.CHUNK_SIZE) || 512,
    chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 64,
  },
  reranker: {
    enabled: process.env.RERANKER_ENABLED === 'true',
    type: (process.env.RERANKER_TYPE as 'local' | 'api' | 'cohere') || 'local',
    model: process.env.RERANKER_MODEL || 'BAAI/bge-reranker-v2-m3',
    apiKey: process.env.COHERE_API_KEY || '',
    topK: Number(process.env.RERANKER_TOP_K) || 20,
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

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function hasDatabaseConfig(): boolean {
  return Boolean(config.database.url);
}

export function hasVectorConfig(): boolean {
  return Boolean(config.upstash.vectorUrl && config.upstash.vectorToken);
}

export function hasRedisConfig(): boolean {
  return Boolean(config.upstash.redisUrl && config.upstash.redisToken);
}

export function hasCatalogServiceConfig(): boolean {
  return Boolean(config.services.catalogUrl);
}

export default config;
