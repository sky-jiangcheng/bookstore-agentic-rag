import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { precomputeEmbeddings } from '@/lib/vercel/simplified-retrieval';
import { validateToken } from '@/lib/clients/auth-client';
import { checkVectorStoreStatus } from '@/lib/vector-initializer';

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/admin/embeddings/precompute
 *
 * Triggers pre-computation of book embeddings into Upstash Vector index.
 * Idempotent: if the store already has data, returns early with status.
 *
 * Can be invoked by:
 * - Vercel Deploy Hooks (via ADMIN_SECRET header)
 * - Vercel Cron Jobs (/api/cron/embeddings via rewrites, with CRON_SECRET)
 * - Authenticated admin users (via Authorization Bearer token)
 *
 * Authentication (at least one must pass):
 *   1. x-admin-secret header matches ADMIN_SECRET env var
 *   2. x-cron-secret header matches CRON_SECRET env var (for Vercel Cron)
 *   3. Authorization: Bearer <token> validated against auth service
 */
export async function POST(request: NextRequest) {
  // --- Auth check ---
  const adminSecret = process.env.ADMIN_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  const headerAdminSecret = request.headers.get('x-admin-secret');
  const headerCronSecret = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');

  let authorized = false;

  // Method 1: static admin secret (CI/CD, deploy hooks) — timing-safe comparison
  if (adminSecret && headerAdminSecret && timingSafeEqual(headerAdminSecret, adminSecret)) {
    authorized = true;
  }

  // Method 2: Vercel Cron secret — timing-safe comparison
  if (!authorized && cronSecret && headerCronSecret && timingSafeEqual(headerCronSecret, cronSecret)) {
    authorized = true;
  }

  // Method 3: JWT token validated by auth service
  if (!authorized && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = await validateToken(token);
    if (result.valid) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { ok: false, status: 'unauthorized', message: '需要管理员权限' },
      { status: 401 },
    );
  }

  // --- Business logic ---
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
      message: '未配置向量存储，请确认 PostgreSQL 已启用 pgvector 扩展',
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
