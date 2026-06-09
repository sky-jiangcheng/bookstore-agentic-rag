import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@vercel/postgres';

interface CategoryItem {
  category: string;
  book_count: number;
  library_types: string[];
  confidence: number;
  percentage: number;
}

interface CategoryResponse {
  library_type?: string;
  categories: CategoryItem[];
  total_categories: number;
  total_books: number;
}

/**
 * 按馆别分类统计
 */
async function getCategoriesByLibraryType(libraryType?: string): Promise<CategoryResponse> {
  if (!libraryType) {
    // 获取全局分类统计
  const result = await sql<CategoryItem>`
    SELECT 
      cm.book_category AS category,
      COUNT(*) AS book_count,
      cm.library_codes AS library_types,
      ROUND(cm.confidence::numeric, 4) AS confidence,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
    FROM category_library_mapping cm
    JOIN books ON books.book_category = cm.book_category
    GROUP BY cm.book_category, cm.library_codes, cm.confidence
    ORDER BY book_count DESC
    LIMIT 100
  `;

    return {
      categories: result.rows,
      total_categories: result.rows.length,
      total_books: result.rows.reduce((sum, row) => sum + Number(row.book_count), 0),
    };
  }

  // 按特定馆别筛选
  const result = await sql<CategoryItem>`
    SELECT 
      cm.book_category AS category,
      COUNT(*) AS book_count,
      cm.library_codes AS library_types,
      ROUND(cm.confidence::numeric, 4) AS confidence,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
    FROM category_library_mapping cm
    JOIN books ON books.book_category = cm.book_category
    WHERE cm.library_codes @> ${`{${libraryType}}`}
    GROUP BY cm.book_category, cm.library_codes, cm.confidence
    ORDER BY book_count DESC
    LIMIT 100
  `;

  return {
    library_type: libraryType,
    categories: result.rows,
    total_categories: result.rows.length,
    total_books: result.rows.reduce((sum, row) => sum + Number(row.book_count), 0),
  };
}

/**
 * 按前缀搜索分类
 */
async function searchCategories(query: string, limit: number = 20): Promise<CategoryItem[]> {
  const result = await sql<CategoryItem>`
    SELECT 
      cm.book_category AS category,
      COUNT(*) AS book_count,
      cm.library_codes AS library_types,
      ROUND(cm.confidence::numeric, 4) AS confidence,
      0 AS percentage
    FROM category_library_mapping cm
    JOIN books ON books.book_category = cm.book_category
    WHERE cm.book_category ILIKE ${`%${query}%`}
    GROUP BY cm.book_category, cm.library_codes, cm.confidence
    ORDER BY book_count DESC
    LIMIT ${limit}
  `;

  return result.rows;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const libraryType = searchParams.get('library_type') || undefined;
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (search) {
      // 搜索模式
      const categories = await searchCategories(search, limit);
      return NextResponse.json({
        categories,
        total: categories.length,
      });
    }

    // 分类导航模式
    const result = await getCategoriesByLibraryType(libraryType);
    return NextResponse.json(result);

  } catch (error) {
    console.error('[catalog/categories] Error:', error);
    return NextResponse.json(
      { error: '获取分类数据失败' },
      { status: 500 }
    );
  }
}
