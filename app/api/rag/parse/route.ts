import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { z } from 'zod';
import { analyzeRequirement, parseExcludedKeywords } from '@/lib/agents/requirement-agent';
import { suggestExclusionCollisions } from '@/components/query-preparation';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const [requirement, vocabularyResult] = await Promise.all([
      analyzeRequirement(parsed.data.query),
      sql<{ keyword: string }>`
        SELECT keyword FROM filter_keywords
        WHERE is_active = TRUE
        ORDER BY id ASC
      `.catch(() => ({ rows: [] as Array<{ keyword: string }> })),
    ]);
    const vocabulary = vocabularyResult.rows.map((row) => row.keyword).filter(Boolean);
    const suggestions = Array.from(new Set([
      ...parseExcludedKeywords(parsed.data.query),
      ...suggestExclusionCollisions(parsed.data.query, vocabulary),
    ])).filter((word) => word && !/预算|元以内|数量|本书/u.test(word));
    requirement.constraints.exclude_keywords = suggestions;

    return NextResponse.json({
      requirement,
      suggestions,
      strategy: requirement.analysis_strategy ?? 'llm',
    });
  } catch (error) {
    logServerError('[RAG Parse]', error);
    return NextResponse.json(buildSafeErrorResponse(error, '需求解析失败'), { status: 500 });
  }
}
