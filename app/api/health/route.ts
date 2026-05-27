import { NextResponse } from 'next/server';

import {
  hasDatabaseConfig,
  hasRedisConfig,
  hasVectorConfig,
} from '@/lib/config/environment';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

export async function GET() {
  const database = hasDatabaseConfig();
  const vector = hasVectorConfig();
  const redis = hasRedisConfig();

  const vectorStoreStatus = await checkVectorStoreStatus();

  return NextResponse.json({
    status: 'ok',
    service: 'bookstore-agentic-rag',
    database,
    vector,
    dependencies: {
      database,
      vector,
      redis,
    },
    vectorStore: {
      configured: vector,
      status: vectorStoreStatus,
      // When empty and configured, the system auto-triggers precompute on first request
      autoPrecompute: vector && vectorStoreStatus === 'empty',
    },
    timestamp: new Date().toISOString(),
  });
}
