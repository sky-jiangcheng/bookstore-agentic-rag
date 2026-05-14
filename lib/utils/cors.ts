/**
 * 统一 CORS 策略
 *
 * 所有 API 端点共享同一套 CORS 逻辑，避免策略不一致。
 * 生产环境必须配置 ALLOWED_ORIGINS，未配置时拒绝跨域请求。
 */

import { NextRequest } from 'next/server';

/**
 * 获取允许的 Origin。
 *
 * - ALLOWED_ORIGINS 未配置时：
 *   - 开发环境返回请求 Origin（宽松模式，方便本地调试）
 *   - 生产环境返回空字符串（拒绝跨域）
 *
 * - ALLOWED_ORIGINS 已配置时：
 *   - 返回匹配的 Origin，不匹配则返回空字符串
 */
export function getAllowedOrigin(request: NextRequest): string {
  const allowed = process.env.ALLOWED_ORIGINS;
  const origin = request.headers.get('origin') || '';

  // 未配置 ALLOWED_ORIGINS
  if (!allowed) {
    const isDev =
      process.env.NODE_ENV === 'development' ||
      (!process.env.VERCEL_ENV && !process.env.APP_ENV);

    // 开发环境：宽松模式，返回请求 origin
    if (isDev && origin) {
      return origin;
    }

    // 生产环境未配置：拒绝跨域
    console.warn(
      '[CORS] ALLOWED_ORIGINS not configured. Cross-origin requests will be rejected in production. ' +
      'Set ALLOWED_ORIGINS environment variable (comma-separated domains) to allow specific origins.',
    );
    return '';
  }

  // 已配置：严格匹配
  const allowedList = allowed.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (origin && allowedList.includes(origin.toLowerCase())) {
    return origin;
  }

  return '';
}

/**
 * CORS 预检请求（OPTIONS）允许的方法
 */
const ALLOWED_METHODS = 'GET, POST, OPTIONS';

/**
 * CORS 预检请求允许的请求头
 */
const ALLOWED_HEADERS = 'Content-Type, Authorization';

/**
 * 构建标准 CORS 响应头。
 * 所有 API 端点应使用此函数确保策略一致。
 */
export function corsHeaders(request: NextRequest): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(request);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    // 允许浏览器缓存预检结果 1 小时
    'Access-Control-Max-Age': '3600',
  };
}

/**
 * 构建 OPTIONS 预检请求的响应。
 * 所有 API 路由的 OPTIONS handler 应调用此函数。
 */
export function handleCorsPreflightRequest(request: NextRequest): Response {
  const headers = corsHeaders(request);
  return new Response(null, { status: 204, headers });
}
