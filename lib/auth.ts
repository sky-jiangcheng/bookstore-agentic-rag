import { NextRequest, NextResponse } from 'next/server';

export function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = process.env.ADMIN_API_KEY;
  
  if (!apiKey) {
    console.error('ADMIN_API_KEY not configured in production');
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: '服务器配置错误' },
        { status: 500 }
      );
    }
    console.warn('ADMIN_API_KEY not configured, skipping authentication in development');
    return null;
  }
  
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json(
      { error: '未授权访问' },
      { status: 401 }
    );
  }
  
  return null;
}

export function requireAdminRole(req: NextRequest) {
  const userRole = req.headers.get('x-user-role');
  
  if (userRole !== 'admin') {
    return NextResponse.json(
      { error: '需要管理员权限' },
      { status: 403 }
    );
  }
  
  return null;
}