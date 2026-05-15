import { NextResponse } from 'next/server';

import {
  hasCatalogServiceConfig,
  hasDatabaseConfig,
  hasRedisConfig,
  hasVectorConfig,
} from '@/lib/config/environment';

export async function GET() {
  const dependencies = {
    database: hasDatabaseConfig(),
    vector: hasVectorConfig(),
    redis: hasRedisConfig(),
    catalogService: hasCatalogServiceConfig(),
  };

  return NextResponse.json({
    status: 'ok',
    service: 'bookstore-agentic-rag',
    database: dependencies.database,
    vector: dependencies.vector,
    dependencies: dependencies,
    timestamp: new Date().toISOString(),
  });
}
