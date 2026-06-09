import { NextRequest, NextResponse } from 'next/server';

import { sql } from '@vercel/postgres';

interface QualityIssue {
  issue_type: string;
  category: string;
  book_count: number;
  library_types: string[];
  confidence: number;
  suggestion: string;
}

/**
 * 检测低置信度映射
 */
async function detectLowConfidenceMappings(): Promise<QualityIssue[]> {
  const result = await sql<QualityIssue>`
    SELECT 
      'low_confidence' AS issue_type,
      cm.category,
      COUNT(*) AS book_count,
      cm.library_types,
      ROUND(cm.confidence::numeric, 4) AS confidence,
      '建议人工审核或调整 category 定义' AS suggestion
    FROM category_library_mapping cm
    JOIN books ON books.category = cm.category
    WHERE cm.confidence < 0.3
    GROUP BY cm.category, cm.library_types, cm.confidence
    HAVING COUNT(*) > 1000
    ORDER BY book_count DESC
    LIMIT 50
  `;

  return result.rows;
}

/**
 * 检测未映射的 category
 */
async function detectUnmappedCategories(): Promise<QualityIssue[]> {
  const result = await sql<QualityIssue>`
    SELECT 
      'unmapped_category' AS issue_type,
      b.category,
      COUNT(*) AS book_count,
      ARRAY_AGG(DISTINCT lt ORDER BY COUNT(*) DESC) FILTER (WHERE lt IS NOT NULL) AS library_types,
      0 AS confidence,
      '未在 category_library_mapping 中定义，建议添加映射' AS suggestion
    FROM books b, UNNEST(b.library_types) AS lt
    WHERE b.category IS NOT NULL 
      AND b.category != ''
      AND b.category NOT IN (SELECT category FROM category_library_mapping)
    GROUP BY b.category
    HAVING COUNT(*) > 100
    ORDER BY book_count DESC
    LIMIT 50
  `;

  return result.rows;
}

/**
 * 检测馆别与分类不匹配
 */
async function detectMismatchedLibraries(): Promise<QualityIssue[]> {
  const result = await sql<QualityIssue>`
    WITH issues AS (
      SELECT 
        'mismatched_library' AS issue_type,
        books.category,
        COUNT(*) AS book_count,
        books.library_types,
        0 AS confidence,
        CASE 
          WHEN books.category IN ('企业管理', '高等学校', '大学生') 
            AND books.library_types @> ARRAY['小学']
          THEN '学科分类不适合小学馆，建议从小学馆排除'
          
          WHEN books.category IN ('童话', '儿童故事', '图画故事', '儿童小说') 
            AND books.library_types @> ARRAY['大学']
          THEN '儿童读物不应主要在大学馆，建议审核大学馆分类'
          
          WHEN books.category = '考研' 
            AND books.library_types @> ARRAY['小学']
          THEN '考研类书籍不适合小学馆'
          
          ELSE '类别与馆别可能不匹配，建议人工审核'
        END AS suggestion
      FROM books
      WHERE 
        (category IN ('企业管理', '高等学校', '大学生') 
         AND library_types @> ARRAY['小学'])
        OR
        (category IN ('童话', '儿童故事', '图画故事', '儿童小说')
         AND library_types @> ARRAY['大学'])
        OR
        (category LIKE '%考研%'
         AND library_types @> ARRAY['小学'])
    )
    SELECT * FROM issues
    ORDER BY book_count DESC
    LIMIT 50
  `;

  return result.rows;
}

/**
 * 检测孤立映射（没有书籍的 category）
 */
async function detectOrphanMappings(): Promise<QualityIssue[]> {
  const result = await sql<QualityIssue>`
    SELECT 
      'orphan_mapping' AS issue_type,
      cm.category,
      0 AS book_count,
      cm.library_types,
      cm.confidence,
      '映射存在但没有书籍，可能是 category 名称变更，建议删除' AS suggestion
    FROM category_library_mapping cm
    LEFT JOIN books ON books.category = cm.category
    WHERE books.category IS NULL
    ORDER BY cm.created_at DESC
    LIMIT 50
  `;

  return result.rows;
}

/**
 * 获取质量统计汇总
 */
async function getQualitySummary() {
  const [ 
    lowConf, 
    unmapped, 
    mismatch,
    orphan,
    totalMappings,
    totalBooks 
  ] = await Promise.all([
    detectLowConfidenceMappings(),
    detectUnmappedCategories(),
    detectMismatchedLibraries(),
    detectOrphanMappings(),
    sql<{ count: number }>`SELECT COUNT(*) AS count FROM category_library_mapping`,
    sql<{ count: number }>`SELECT COUNT(*) AS count FROM books`,
  ]);

  return {
    total_mappings: (totalMappings.rows[0] as any).count,
    total_books: (totalBooks.rows[0] as any).count,
    issues: {
      low_confidence: lowConf.length,
      unmapped_category: unmapped.length,
      mismatched_library: mismatch.length,
      orphan_mapping: orphan.length,
      total: lowConf.length + unmapped.length + mismatch.length + orphan.length,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    // 只返回汇总统计
    if (!type) {
      const summary = await getQualitySummary();
      return NextResponse.json(summary);
    }

    // 返回详细问题列表
    let issues: QualityIssue[] = [];

    switch (type) {
      case 'low_confidence':
        issues = await detectLowConfidenceMappings();
        break;
      case 'unmapped':
        issues = await detectUnmappedCategories();
        break;
      case 'mismatch':
        issues = await detectMismatchedLibraries();
        break;
      case 'orphan':
        issues = await detectOrphanMappings();
        break;
      default:
        return NextResponse.json(
          { error: '无效的问题类型，可选：low_confidence, unmapped, mismatch, orphan' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      issue_type: type,
      issues,
      total: issues.length,
    });

  } catch (error) {
    console.error('[admin/category-quality] GET error:', error);
    return NextResponse.json(
      { error: '获取质量数据失败' },
      { status: 500 }
    );
  }
}
