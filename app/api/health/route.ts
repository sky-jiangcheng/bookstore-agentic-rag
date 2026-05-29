import { NextResponse } from 'next/server';

import {
  hasDatabaseConfig,
  hasRedisConfig,
} from '@/lib/config/environment';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

export async function GET() {
  const database = hasDatabaseConfig();
  const redis = hasRedisConfig();
  const vector = hasDatabaseConfig(); // pgvector is always available when database is configured

  const vectorStoreStatus = await checkVectorStoreStatus();

  const requiredDepsMet = database;
  const status = requiredDepsMet ? 'ok' : 'degraded';

  return NextResponse.json({
    status,
    healthy: requiredDepsMet,
    database,
    vector,
    service: 'bookstore-agentic-rag',
    dependencies: {
      database,
      vector: true,
      redis,
    },
    vectorStore: {
      configured: true,
      status: vectorStoreStatus,
      autoPrecompute: vector && vectorStoreStatus === 'empty',
    },
    timestamp: new Date().toISOString(),
  });
}
