import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { z } from 'zod';
import { analyzeRequirement, parseExcludedKeywords } from '@/lib/agents/requirement-agent';
import { suggestExclusionCollisions } from '@/components/query-preparation';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';
import { createModel } from '@/lib/ai/model-factory';
import type { LLMProviderConfig } from '@/lib/config/provider-config';

const providerSchema = z.object({
  type: z.literal('openai-compatible'),
  apiKey: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
});

const requestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  llmProvider: providerSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { query, llmProvider } = parsed.data;

    if (!llmProvider) {
      return NextResponse.json({ error: '未配置LLM Provider，请在设置中配置' }, { status: 400 });
    }

    const model = createModel(llmProvider as LLMProviderConfig);
    const requirement = await analyzeRequirement(query, { model });

    const inferredType = requirement.inferred_library_type || 'none';

    let vocabulary: string[] = [];
    if (inferredType !== 'none') {
      try {
        const vocabularyResult = await sql<{ keyword: string }>`
          SELECT keyword FROM filter_keywords
          WHERE library_code = ${inferredType} AND is_active = TRUE
          ORDER BY id ASC
        `;
        vocabulary = vocabularyResult.rows.map((row) => row.keyword).filter(Boolean);
      } catch (err) {
        console.warn('[RAG Parse] Database unavailable, skipping vocabulary lookup:', String(err));
      }
    }
    const suggestions = Array.from(new Set([
      ...parseExcludedKeywords(query),
      ...suggestExclusionCollisions(query, vocabulary),
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
