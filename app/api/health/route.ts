import { NextResponse } from 'next/server';

import {
  hasCatalogServiceConfig,
  hasDatabaseConfig,
  hasRedisConfig,
  hasVectorConfig,
} from '@/lib/config/environment';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

export async function GET() {
  const database = hasDatabaseConfig();
  const vector = hasVectorConfig();
  const redis = hasRedisConfig();
  const catalogService = hasCatalogServiceConfig();

  const vectorStoreStatus = await checkVectorStoreStatus();

  const requiredDepsMet = database || catalogService;
  const status = requiredDepsMet ? 'ok' : 'degraded';

  return NextResponse.json({
    status,
    healthy: requiredDepsMet,
    database,
    vector,
    service: 'bookstore-agentic-rag',
    dependencies: {
      database,
      vector,
      redis,
      catalogService,
    },
    vectorStore: {
      configured: vector,
      status: vectorStoreStatus,
      autoPrecompute: vector && vectorStoreStatus === 'empty',
    },
    timestamp: new Date().toISOString(),
  });
}
