/**
 * Admin API 认证保护
 * 
 * 为管理后台 API 提供统一的认证检查。
 * 支持 Bearer token 验证，防止未授权访问。
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/clients/auth-client';
import { corsHeaders } from '@/lib/utils/cors';

/** Admin API 路由的 Bearer token 前缀 */
const BEARER_PREFIX = 'Bearer ';

/**
 * 从请求头提取 Bearer token
 */
function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  return authHeader.slice(BEARER_PREFIX.length).trim();
}

/**
 * 验证 admin API 请求的认证状态
 * 
 * @returns 认证成功返回 null，认证失败返回错误响应
 */
export async function requireAdminAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  const token = extractBearerToken(req);
  
  // 无 token
  if (!token) {
    return NextResponse.json(
      { error: '未授权访问，请提供有效的认证令牌' },
      { status: 401, headers: corsHeaders(req) }
    );
  }
  
  // 验证 token
  const result = await validateToken(token);
  
  if (!result.valid) {
    return NextResponse.json(
      { error: '认证令牌无效或已过期' },
      { status: 403, headers: corsHeaders(req) }
    );
  }
  
  // 认证成功
  return null;
}
