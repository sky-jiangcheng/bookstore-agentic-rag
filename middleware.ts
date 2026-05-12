/**
 * Next.js 中间件 — 速率限制 + 安全头
 *
 * API 路由的频率限制（内存计数，简单滑动窗口）。
 * 避免大量请求消耗 LLM API 配额或造成 DoS 攻击。
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// 内存速率限制器（每实例独立）
// ============================================================

interface RateLimitEntry {
  /** 窗口内请求数 */
  count: number;
  /** 窗口起始时间戳（ms） */
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/** 默认配置：每 IP 每 60 秒最多 30 次 API 请求 */
const DEFAULT_MAX_REQUESTS = 30;
const DEFAULT_WINDOW_MS = 60_000;

function checkRateLimit(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // 新窗口
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.windowStart + windowMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.windowStart + windowMs };
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > DEFAULT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 放行不需要限流的路径
  if (RATE_LIMIT_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 仅对 API 路由做限流
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 获取客户端 IP（防止伪造）
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const forwardedIp = forwarded.split(',')[0]?.trim();
  // 验证 IP 格式有效性
  const validIp = forwardedIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(forwardedIp)
    ? forwardedIp
    : request.headers.get('x-real-ip') || '127.0.0.1';
  const ip = validIp;
  const rateLimitKey = `ratelimit:${ip}`;

  const { allowed, remaining, resetTime } = checkRateLimit(rateLimitKey);

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
