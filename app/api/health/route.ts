import { NextResponse } from 'next/server';

import {
  hasCatalogServiceConfig,
  hasDatabaseConfig,
  hasRedisConfig,
  hasVectorConfig,
} from '@/lib/config/environment';
import { getFilterStatus } from '@/lib/server/book-filters';

export async function GET() {
  const productionSurface =
    process.env.APP_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  if (productionSurface) {
    return NextResponse.json({
      status: 'ok',
      service: 'bookstore-agentic-rag',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    });
  }

  const filters = process.env.NEXT_PHASE === 'phase-production-build'
    ? {
        enabled: false,
        keywords: [],
        sources: {
          database: false,
          env: false,
        },
      }
    : await getFilterStatus();

  return NextResponse.json({
    status: 'ok',
    service: 'bookstore-agentic-rag',
    dataSources: {
      database: hasDatabaseConfig(),
      vector: hasVectorConfig(),
      redis: hasRedisConfig(),
      catalogServiceFallback: hasCatalogServiceConfig(),
    },
    filters: {
      enabled: filters.enabled,
      keywordCount: filters.keywords.length,
      sources: filters.sources,
    },
    timestamp: new Date().toISOString(),
  });
}
