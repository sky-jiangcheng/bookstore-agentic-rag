import { NextResponse } from 'next/server';

import {
  hasDatabaseConfig,
  hasRedisConfig,
} from '@/lib/config/environment';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

export async function GET() {
  const database = hasDatabaseConfig();
  const redis = hasRedisConfig();

  const vectorStoreStatus = await checkVectorStoreStatus();

  return NextResponse.json({
    status: 'ok',
    service: 'bookstore-agentic-rag',
    database,
    vector: true,
    dependencies: {
      database,
      vector: true,
      redis,
    },
    vectorStore: {
      configured: true,
      status: vectorStoreStatus,
      // When empty and configured, the system auto-triggers precompute on first request
      autoPrecompute: vectorStoreStatus === 'empty',
    },
    timestamp: new Date().toISOString(),
  });
}
