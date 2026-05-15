import { NextResponse } from 'next/server';

import { precomputeEmbeddings } from '@/lib/vercel/simplified-retrieval';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

/**
 * POST /api/admin/embeddings/precompute
 *
 * Triggers pre-computation of book embeddings into Upstash Vector index.
 * Idempotent: if the store already has data, returns early with status.
 *
 * Can be invoked by:
 * - Vercel Deploy Hooks
 * - Vercel Cron Jobs (/api/cron/embeddings via rewrites)
 * - Manual curl/wget from CI/CD pipeline
 */
export async function POST() {
  const status = await checkVectorStoreStatus();
  if (status === 'has_data') {
    return NextResponse.json({
      ok: true,
      status: 'skipped',
      message: '向量存储已有数据，无需重新计算',
    });
  }
  if (status === 'unchecked') {
    return NextResponse.json({
      ok: false,
      status: 'unconfigured',
      message: '未配置向量存储 (UPSTASH_VECTOR_REST_URL/TOKEN)',
    });
  }

  // Fire and forget — this is a long-running operation
  precomputeEmbeddings().catch((err) => {
    console.error('[precompute] Error during triggered precompute:', err);
  });

  return NextResponse.json({
    ok: true,
    status: 'triggered',
    message: '向量预计算已启动（后台执行）',
  });
}
