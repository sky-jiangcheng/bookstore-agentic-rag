import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { corsHeaders, handleCorsPreflightRequest } from '@/lib/utils/cors';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';
import { requireAdminAuth } from '@/lib/utils/admin-auth';
import { z } from 'zod';

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflightRequest(req);
}

const createSchema = z.object({
  code: z.string()
    .min(1, '馆别代码不能为空')
    .max(50, '馆别代码最长 50 字符')
    .regex(/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/, '馆别代码只能包含中文、字母、数字和下划线'),
  name: z.string().min(1, '馆别名称不能为空').max(100, '馆别名称最长 100 字符'),
  sort_order: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const result = await sql`
      SELECT
        lc.code,
        lc.name,
        lc.icon,
        lc.sort_order,
        lc.reclassified_at,
        lc.created_at,
        COUNT(fk.id)::int AS keyword_count
      FROM library_categories lc
      LEFT JOIN filter_keywords fk ON fk.category = lc.code AND fk.is_active = TRUE
      GROUP BY lc.code, lc.name, lc.icon, lc.sort_order, lc.reclassified_at, lc.created_at
      ORDER BY lc.sort_order ASC, lc.code ASC
    `;

    return NextResponse.json({ categories: result.rows }, { headers: corsHeaders(req) });
  } catch (error) {
    logServerError('[admin/library-categories]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取馆别列表失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 认证检查
    const authError = await requireAdminAuth(req);
    if (authError) return authError;

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid params', details: parsed.error.flatten() },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    const { code, name, sort_order } = parsed.data;

    await sql`
      INSERT INTO library_categories (code, name, sort_order)
      VALUES (${code}, ${name}, ${sort_order ?? 99})
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true, code }, { status: 201, headers: corsHeaders(req) });
  } catch (error) {
    logServerError('[admin/library-categories]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '创建馆别失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // 认证检查
    const authError = await requireAdminAuth(req);
    if (authError) return authError;

    const code = req.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json(
        { error: 'Missing code query param' },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    // Deactivate all keywords for this category, then remove the category
    await sql`UPDATE filter_keywords SET is_active = FALSE, updated_at = NOW() WHERE category = ${code}`;
    await sql`DELETE FROM library_categories WHERE code = ${code}`;

    return NextResponse.json({ success: true }, { headers: corsHeaders(req) });
  } catch (error) {
    logServerError('[admin/library-categories]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '删除馆别失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
