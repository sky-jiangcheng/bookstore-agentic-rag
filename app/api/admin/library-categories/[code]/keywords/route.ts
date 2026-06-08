import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { corsHeaders } from '@/lib/utils/cors';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';
import { z } from 'zod';

type RouteParams = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400, headers: corsHeaders(req) });
    }

    const result = await sql<{ keyword: string }>`
      SELECT keyword
      FROM filter_keywords
      WHERE category = ${code} AND is_active = TRUE
      ORDER BY id ASC
    `;

    return NextResponse.json({ keywords: result.rows.map(r => r.keyword).filter(Boolean) }, { headers: corsHeaders(req) });
  } catch (error) {
    logServerError('[admin/keywords]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '获取屏蔽词失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

const putSchema = z.object({
  keywords: z.array(z.string().min(1)),
});

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400, headers: corsHeaders(req) });
    }

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid params', details: parsed.error.flatten() },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    const { keywords } = parsed.data;

    // Deactivate all existing keywords for this category
    await sql`
      UPDATE filter_keywords
      SET is_active = FALSE, updated_at = NOW()
      WHERE category = ${code}
    `;

    // Insert the new set
    for (const keyword of keywords) {
      await sql`
        INSERT INTO filter_keywords (keyword, category, is_active)
        VALUES (${keyword}, ${code}, TRUE)
        ON CONFLICT (keyword, category)
        DO UPDATE SET is_active = TRUE, updated_at = NOW()
      `;
    }

    // Mark category as needing reclassification
    await sql`
      UPDATE library_categories
      SET reclassified_at = NULL, updated_at = NOW()
      WHERE code = ${code}
    `;

    return NextResponse.json({ success: true, count: keywords.length }, { headers: corsHeaders(req) });
  } catch (error) {
    logServerError('[admin/keywords]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '更新屏蔽词失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
