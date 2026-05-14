/**
 * Next.js 中间件 — 速率限制 + 安全头
 *
 * API 路由的频率限制。
 * 使用 Upstash Redis 实现分布式限流（支持 serverless 环境）；
 * Redis 不可用时降级为内存计数（仅在单实例场景有效）。
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// 分布式速率限制器（Upstash Redis 优先，内存降级）
// ============================================================

interface RateLimitEntry {
  /** 窗口内请求数 */
  count: number;
  /** 窗口起始时间戳（ms） */
  windowStart: number;
}

/** 内存降级存储（仅 Redis 不可用时使用，serverless 下每个冷启动独立） */
const memoryRateLimitMap = new Map<string, RateLimitEntry>();

/** 默认配置：每 IP 每 60 秒最多 30 次 API 请求 */
const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * 尝试通过 Upstash Redis 进行分布式限流。
 * Redis 不可用时返回 null，由调用方降级到内存限流。
 */
async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetTime: number } | null> {
  try {
    const { redis } = await import('@/lib/upstash');
    if (!redis) return null;

    const now = Date.now();
    const windowKey = `ratelimit:window:${key}`;
    const countKey = `ratelimit:count:${key}`;

    // 使用 Redis MULTI 保证原子性
    const windowStart = await redis.get<number>(windowKey);
    if (!windowStart || now - windowStart > windowMs) {
      // 新窗口
      const multi = redis.multi();
      multi.set(windowKey, now, { ex: Math.ceil(windowMs / 1000) * 2 });
      multi.set(countKey, 1, { ex: Math.ceil(windowMs / 1000) * 2 });
      await multi.exec();
      return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
    }

    const currentCount = await redis.incr(countKey);
    const remaining = Math.max(0, maxRequests - currentCount);
    const allowed = currentCount <= maxRequests;

    return { allowed, remaining, resetTime: windowStart + windowMs };
  } catch {
    // Redis 错误时降级到内存限流
    return null;
  }
}

function checkMemoryRateLimit(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = memoryRateLimitMap.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // 新窗口
    memoryRateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.windowStart + windowMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.windowStart + windowMs };
}

/**
 * 统一限流检查：Redis 优先 → 内存降级
 */
async function checkRateLimit(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const redisResult = await checkRedisRateLimit(key, maxRequests, windowMs);
  if (redisResult !== null) return redisResult;

  // 降级到内存限流
  return checkMemoryRateLimit(key, maxRequests, windowMs);
}

// 内存限流定期清理过期条目（仅在非构建阶段运行）
if (typeof process !== 'undefined' && process.env?.NEXT_PHASE !== 'phase-production-build') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryRateLimitMap.entries()) {
      if (now - entry.windowStart > DEFAULT_WINDOW_MS * 2) {
        memoryRateLimitMap.delete(key);
      }
    }
  }, 60_000);
}

// ============================================================
// 中间件主逻辑
// ============================================================

/** 不需要频率限制的路径（健康检查、静态资源） */
const RATE_LIMIT_EXEMPT_PATHS = [
  '/api/health',
  '/_next/',
  '/static/',
  '/favicon',
  '/robots.txt',
];

/**
 * 从请求中提取客户端 IP，支持 IPv4 和 IPv6。
 * 优先使用 X-Forwarded-For 第一个值，其次 X-Real-Ip。
 */
function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const forwardedIp = forwarded.split(',')[0]?.trim();

  // 验证 IP 格式：接受 IPv4 和 IPv6
  const IP_REGEX = /^[\d.:a-fA-F]+$/;
  if (forwardedIp && IP_REGEX.test(forwardedIp)) {
    return forwardedIp;
  }

  const realIp = request.headers.get('x-real-ip') || '';
  if (realIp && IP_REGEX.test(realIp)) {
    return realIp;
  }

  // 无法识别 IP 时使用 unknown（不使用 127.0.0.1 避免多用户共享同一限流桶）
  return 'unknown';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行不需要限流的路径
  if (RATE_LIMIT_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 仅对 API 路由做限流
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = extractClientIp(request);
  const rateLimitKey = `ratelimit:${ip}`;

  const { allowed, remaining, resetTime } = await checkRateLimit(rateLimitKey);

  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    return new NextResponse(
      JSON.stringify({ error: '请求过于频繁，请稍后再试', retry_after: retryAfter }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(DEFAULT_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(DEFAULT_MAX_REQUESTS));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
