import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@vercel/postgres';

interface CategoryMapping {
  category: string;
  library_types: string[];
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
        cm.category,
        cm.library_types,
        ROUND(cm.confidence, 4) AS confidence,
        cm.auto_assigned,
        COUNT(*) AS book_count,
        cm.created_at,
        cm.updated_at
      FROM category_library_mapping cm
      JOIN books ON books.category = cm.category
      GROUP BY cm.category, cm.library_types, cm.confidence, cm.auto_assigned, cm.created_at, cm.updated_at
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
    havingParts.push(`cm.library_types @> $${values.length + 1}`);
    values.push([library_type]);
  }
  
  const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : '';

  const query = `
    SELECT 
      cm.category,
      cm.library_types,
      ROUND(cm.confidence, 4) AS confidence,
      cm.auto_assigned,
      COUNT(*) AS book_count,
      cm.created_at,
      cm.updated_at
    FROM category_library_mapping cm
    JOIN books ON books.category = cm.category
    ${whereClause}
    GROUP BY cm.category, cm.library_types, cm.confidence, cm.auto_assigned, cm.created_at, cm.updated_at
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
  category: string,
  library_types: string[],
): Promise<CategoryMapping> {
  // 将数组转换为 Postgres 数组格式
  const libraryTypesStr = `{${library_types.join(',')}}`;
  
  const result = await sql<CategoryMapping>`
    UPDATE category_library_mapping
    SET 
      library_types = ${libraryTypesStr}::text[],
      auto_assigned = FALSE,
      updated_at = NOW()
    WHERE category = ${category}
    RETURNING 
      category,
      library_types,
      confidence,
      auto_assigned,
      created_at,
      updated_at
  `;

  if (result.rows.length === 0) {
    throw new Error(`Category not found: ${category}`);
  }

  // 获取书籍数量
  const countResult = await sql<{ book_count: number }>`
    SELECT COUNT(*) AS book_count 
    FROM books 
    WHERE category = ${category}
  `;

  return {
    ...result.rows[0],
    book_count: Number(countResult.rows[0].book_count),
  };
}

/**
 * 删除映射（恢复为自动分配）
 */
async function deleteMapping(category: string): Promise<void> {
  await sql`
    DELETE FROM category_library_mapping
    WHERE category = ${category}
  `;
}

/**
 * 重新计算映射（基于实际分布）
 */
async function recalculateMapping(category?: string): Promise<{ updated: number }> {
  let result;
  
  if (category) {
    // 重新计算单个 category
    result = await sql`
      INSERT INTO category_library_mapping (category, library_types, confidence, auto_assigned)
      SELECT 
        category,
        ARRAY_AGG(lt ORDER BY pct DESC) FILTER (WHERE pct >= 0.2) AS library_types,
        MAX(pct) AS confidence,
        TRUE AS auto_assigned
      FROM (
        SELECT 
          category,
          lt,
          COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY category) AS pct
        FROM books, UNNEST(library_types) AS lt
        WHERE category = ${category}
        GROUP BY category, lt
      ) AS distribution
      GROUP BY category
      ON CONFLICT (category) DO UPDATE SET
        library_types = EXCLUDED.library_types,
        confidence = EXCLUDED.confidence,
        auto_assigned = TRUE,
        updated_at = NOW()
    `;
  } else {
    // 重新计算所有 category
    result = await sql`
      INSERT INTO category_library_mapping (category, library_types, confidence, auto_assigned)
      SELECT 
        category,
        ARRAY_AGG(lt ORDER BY pct DESC) FILTER (WHERE pct >= 0.2) AS library_types,
        MAX(pct) AS confidence,
        TRUE AS auto_assigned
      FROM (
        SELECT 
          category,
          lt,
          COUNT(*) * 1.0 / SUM(COUNT(*)) OVER (PARTITION BY category) AS pct
        FROM books, UNNEST(library_types) AS lt
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category, lt
      ) AS distribution
      GROUP BY category
      ON CONFLICT (category) DO UPDATE SET
        library_types = EXCLUDED.library_types,
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
    const { category, library_types, action } = body;

    if (!category) {
      return NextResponse.json(
        { error: '缺少 category 参数' },
        { status: 400 }
      );
    }

    if (action === 'delete') {
      await deleteMapping(category);
      return NextResponse.json({ success: true, message: '已删除映射' });
    }

    if (action === 'recalculate') {
      const result = await recalculateMapping(category);
      return NextResponse.json({ 
        success: true, 
        message: '已重新计算映射',
        updated: result.updated 
      });
    }

    if (!library_types || !Array.isArray(library_types)) {
      return NextResponse.json(
        { error: 'library_types 必须是数组' },
        { status: 400 }
      );
    }

    const updated = await updateMapping(category, library_types);
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
    const { action, category } = body;

    if (action === 'recalculate') {
      const result = await recalculateMapping(category);
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
