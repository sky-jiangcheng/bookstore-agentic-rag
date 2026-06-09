import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { corsHeaders } from '@/lib/utils/cors';
import { logServerError, buildSafeErrorResponse } from '@/lib/utils/safe-error';
import { requireAdminAuth } from '@/lib/utils/admin-auth';

const BATCH_SIZE = 200;

/**
 * Batched, idempotent reclassification of books.library_types.
 *
 * For each book, evaluate all active filter_keywords rules:
 *  - If a keyword appears in (title || category || description), add rule's category
 *  - If no rules match, assign ['公共馆'] as default
 *
 * Uses keyset pagination so it's safe to interrupt and resume.
 * Returns progress so the frontend can show status.
 */
export async function POST(req: NextRequest) {
  try {
    // 认证检查
    const authError = await requireAdminAuth(req);
    if (authError) return authError;

    // Load all active classification rules: { keyword, category }
    const rulesResult = await sql<{ keyword: string; category: string }>`
      SELECT DISTINCT fk.keyword, fk.category
      FROM filter_keywords fk
      INNER JOIN library_categories lc ON lc.code = fk.category
      WHERE fk.is_active = TRUE
      ORDER BY fk.category, fk.keyword
    `;
    const rules = rulesResult.rows;

    if (rules.length === 0) {
      return NextResponse.json({
        status: 'no_rules',
        message: '没有活跃的分类规则，跳过重分类',
        categories_updated: [],
      }, { headers: corsHeaders(req) });
    }

    // 开启事务（确保所有更新原子性）
    await sql`BEGIN`;

    try {
      // Group rules by category for efficient checking
      const rulesByCategory = new Map<string, string[]>();
      for (const rule of rules) {
        const list = rulesByCategory.get(rule.category) ?? [];
        list.push(rule.keyword);
        rulesByCategory.set(rule.category, list);
      }

    let processed = 0;
    let lastId = '0';
    let hasMore = true;
    const updatedCategories = new Set<string>();

    while (hasMore) {
      const batch = await sql<{ id: string; title: string; category: string; description: string }>`
        SELECT id::text, title, category, COALESCE(description, '') AS description
        FROM books
        WHERE id > ${lastId}::bigint
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE}
      `;

      if (batch.rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const book of batch.rows) {
        const haystack = `${book.title} ${book.category} ${book.description}`.toLowerCase();
        const matched: string[] = [];

        for (const [category, keywords] of rulesByCategory) {
          if (keywords.some(kw => haystack.includes(kw.toLowerCase()))) {
            matched.push(category);
            updatedCategories.add(category);
          }
        }

        // Default to 公共馆 if no rules match
        if (matched.length === 0) {
          matched.push('公共馆');
          updatedCategories.add('公共馆');
        }

        // Build array literal: each category needs quoting to be safe
        const typesStr = '{' + matched.map(c => `"${c.replace(/"/g, '\\"')}"`).join(',') + '}';
        await sql`
          UPDATE books
          SET library_types = ${typesStr}::text[]
          WHERE id = ${book.id}::bigint
        `;

        processed += 1;
      }

      lastId = batch.rows[batch.rows.length - 1].id;
    }

    // Update reclassified_at for all affected categories
    if (updatedCategories.size > 0) {
      const codes = Array.from(updatedCategories);
      for (const code of codes) {
        await sql`
          UPDATE library_categories
          SET reclassified_at = NOW(), updated_at = NOW()
          WHERE code = ${code}
        `;
      }
    }

    // 提交事务
    await sql`COMMIT`;

    return NextResponse.json({
      status: 'complete',
      processed,
      rules_count: rules.length,
      categories_updated: Array.from(updatedCategories),
    }, { headers: corsHeaders(req) });
    } catch (innerError) {
      // 事务内错误，回滚
      await sql`ROLLBACK`;
      throw innerError;
    }
  } catch (error) {
    logServerError('[admin/reclassify]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '重分类失败'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
