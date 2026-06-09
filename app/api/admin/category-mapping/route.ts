import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@vercel/postgres';

interface CategoryMapping {
  book_category: string;
  library_codes: string[];
  confidence: number;
  auto_assigned: boolean;
  book_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * 获取所有映射 (支持筛选)
 */
async function getMappings(filters?: {
  min_book_count?: number;
  max_confidence?: number;
  library_type?: string;
  auto_only?: boolean;
  limit?: number;
}): Promise<CategoryMapping[]> {
  const limit = filters?.limit || 100;
  const { min_book_count, max_confidence, library_type, auto_only } = filters || {};

  // 无筛选条件
  if (!min_book_count && !max_confidence && !library_type && !auto_only) {
    const result = await sql<CategoryMapping>`
      SELECT 
        cm.book_category,
        cm.library_codes,
        ROUND(cm.confidence::numeric, 4) AS confidence,
        cm.auto_assigned,
        COUNT(*) AS book_count,
        cm.created_at,
        cm.updated_at
      FROM category_library_mapping cm
      JOIN books ON books.book_category = cm.book_category
      GROUP BY cm.book_category, cm.library_codes, cm.confidence, cm.auto_assigned, cm.created_at, cm.updated_at
      ORDER BY book_count DESC
      LIMIT ${limit}
    `;
    return result.rows;
  }

  // 有筛选条件
  const whereClause = auto_only ? 'WHERE cm.auto_assigned = TRUE' : '';
  
  const havingParts: string[] = [];
  const values: any[] = [];
  
  if (min_book_count) {
    havingParts.push(`COUNT(*) >= $${values.length + 1}`);
    values.push(min_book_count);
  }
  if (max_confidence) {
    havingParts.push(`cm.confidence <= $${values.length + 1}`);
    values.push(max_confidence);
  }
  if (library_type) {
    havingParts.push(`cm.library_codes @> $${values.length + 1}`);
    values.push([library_type]);
  }
  
  const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : '';

  const query = `
    SELECT 
      cm.book_category,
      cm.library_codes,
      ROUND(cm.confidence::numeric, 4) AS confidence,
      cm.auto_assigned,
      COUNT(*) AS book_count,
      cm.created_at,
      cm.updated_at
    FROM category_library_mapping cm
    JOIN books ON books.book_category = cm.book_category
    ${whereClause}
    GROUP BY cm.book_category, cm.library_codes, cm.confidence, cm.auto_assigned, cm.created_at, cm.updated_at
    ${havingClause}
    ORDER BY book_count DESC
    LIMIT ${limit}
  `;

  // 使用原始查询（注意：这有 SQL 注入风险，但值都是数字和受控的）
  const result = await sql.query<CategoryMapping>(query, values);
  return result.rows;
}

/**
 * 更新单个映射
 */
async function updateMapping(
  bookCategory: string,
  libraryCodes: string[],
): Promise<CategoryMapping> {
  const libraryCodesStr = `{${libraryCodes.join(',')}}`;
  
  const result = await sql<CategoryMapping>`
    UPDATE category_library_mapping
    SET 
      library_codes = ${libraryCodesStr}::text[],
      auto_assigned = FALSE,
      updated_at = NOW()
    WHERE book_category = ${bookCategory}
    RETURNING 
      book_category,
      library_codes,
      confidence,
      auto_assigned,
      created_at,
      updated_at
  `;

  if (result.rows.length === 0) {
    throw new Error(`Category not found: ${bookCategory}`);
  }

  // 获取书籍数量
  const countResult = await sql<{ book_count: number }>`
    SELECT COUNT(*) AS book_count 
    FROM books 
    WHERE book_category = ${bookCategory}
  `;

  return {
    ...result.rows[0],
    book_count: Number(countResult.rows[0].book_count),
  };
}

/**
 * 删除映射（恢复为自动分配）
 */
async function deleteMapping(bookCategory: string): Promise<void> {
  await sql`
    DELETE FROM category_library_mapping
    WHERE book_category = ${bookCategory}
  `;
}

/**
 * 重新计算映射（基于实际分布）
 */
async function recalculateMapping(bookCategory?: string): Promise<{ updated: number }> {
  let result;
  
  if (bookCategory) {
    // 重新计算单个 category
    result = await sql`
      INSERT INTO category_library_mapping (book_category, library_codes, confidence, auto_assigned)
      SELECT 
        book_category,
        ARRAY_AGG(lt ORDER BY pct DESC) FILTER (WHERE pct >= 0.2) AS library_codes,
        MAX(pct) AS confidence,
        TRUE AS auto_assigned
      FROM (
        SELECT 
          book_category,
          lt,
          COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY book_category) AS pct
        FROM books, UNNEST(library_codes) AS lt
        WHERE book_category = ${bookCategory}
        GROUP BY book_category, lt
      ) AS distribution
      GROUP BY book_category
      ON CONFLICT (book_category) DO UPDATE SET
        library_codes = EXCLUDED.library_codes,
        confidence = EXCLUDED.confidence,
        auto_assigned = TRUE,
        updated_at = NOW()
    `;
  } else {
    // 重新计算所有 category
    result = await sql`
      INSERT INTO category_library_mapping (book_category, library_codes, confidence, auto_assigned)
      SELECT 
        book_category,
        ARRAY_AGG(lt ORDER BY pct DESC) FILTER (WHERE pct >= 0.2) AS library_codes,
        MAX(pct) AS confidence,
        TRUE AS auto_assigned
      FROM (
        SELECT 
          book_category,
          lt,
          COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY book_category) AS pct
        FROM books, UNNEST(library_codes) AS lt
        WHERE book_category IS NOT NULL AND book_category != ''
        GROUP BY book_category, lt
      ) AS distribution
      GROUP BY book_category
      ON CONFLICT (book_category) DO UPDATE SET
        library_codes = EXCLUDED.library_codes,
        confidence = EXCLUDED.confidence,
        auto_assigned = TRUE,
        updated_at = NOW()
    `;
  }

  return { updated: result.rowCount || 0 };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const min_book_count = searchParams.get('min_book_count') 
      ? parseInt(searchParams.get('min_book_count')!, 10) 
      : undefined;
    
    const max_confidence = searchParams.get('max_confidence') 
      ? parseFloat(searchParams.get('max_confidence')!) 
      : undefined;
    
    const library_type = searchParams.get('library_type') || undefined;
    const auto_only = searchParams.get('auto_only') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const mappings = await getMappings({
      min_book_count,
      max_confidence,
      library_type,
      auto_only,
      limit,
    });

    return NextResponse.json({ mappings, total: mappings.length });

  } catch (error) {
    console.error('[admin/category-mapping] GET error:', error);
    return NextResponse.json(
      { error: '获取映射数据失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { book_category, library_codes, action } = body;

    if (!book_category) {
      return NextResponse.json(
        { error: '缺少 book_category 参数' },
        { status: 400 }
      );
    }

    if (action === 'delete') {
      await deleteMapping(book_category);
      return NextResponse.json({ success: true, message: '已删除映射' });
    }

    if (action === 'recalculate') {
      const result = await recalculateMapping(book_category);
      return NextResponse.json({ 
        success: true, 
        message: '已重新计算映射',
        updated: result.updated 
      });
    }

    if (!library_codes || !Array.isArray(library_codes)) {
      return NextResponse.json(
        { error: 'library_codes 必须是数组' },
        { status: 400 }
      );
    }

    const updated = await updateMapping(book_category, library_codes);
    return NextResponse.json({ success: true, mapping: updated });

  } catch (error) {
    console.error('[admin/category-mapping] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新映射失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, book_category } = body;

    if (action === 'recalculate') {
      const result = await recalculateMapping(book_category);
      return NextResponse.json({ 
        success: true, 
        message: '已重新计算映射',
        updated: result.updated 
      });
    }

    return NextResponse.json(
      { error: '不支持的操作' },
      { status: 400 }
    );

  } catch (error) {
    console.error('[admin/category-mapping] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 }
    );
  }
}
