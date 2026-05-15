import 'server-only';

import { randomUUID } from 'crypto';

import { runRAGPipeline } from '@/lib/agents/orchestrator';
import { analyzeRequirement } from '@/lib/agents/requirement-agent';
import config from '@/lib/config/environment';
import {
  buildUserQueryFromParsed,
  parsedRequirementsToRequirementAnalysis,
  recommendedBookToApiBook,
  requirementAnalysisToParsed,
  stableIntFromString,
} from '@/lib/book-list/mappers';
import { getBookListParseSession, saveBookListParseSession } from '@/lib/book-list/session-store';
import type {
  GenerateBookListRequest,
  GenerateBookListResponse,
  ParseRequirementsRequest,
  ParseRequirementsResponse,
  ParsedRequirements,
} from '@/lib/book-list/types';
import type { RecommendedBook } from '@/lib/types/rag';
import { runVercelRAGPipeline } from '@/lib/vercel/simplified-orchestrator';

export class BookListHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BookListHttpError';
  }
}

function normalizeIncomingParsedRequirements(raw: ParsedRequirements): ParsedRequirements {
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((c) => ({
        category: String(c.category ?? '').trim() || '综合',
        percentage: Math.min(100, Math.max(0, Number(c.percentage) || 0)),
        count: Math.max(0, Math.floor(Number(c.count) || 0)),
      }))
    : [];

  return {
    target_audience: raw.target_audience ?? null,
    cognitive_level: raw.cognitive_level ?? null,
    categories,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    constraints: Array.isArray(raw.constraints) ? raw.constraints.map(String) : [],
    exclude_textbooks: raw.exclude_textbooks !== false,
    min_cognitive_level: raw.min_cognitive_level ?? null,
  };
}

export async function parseBookListRequirements(
  body: ParseRequirementsRequest,
): Promise<ParseRequirementsResponse> {
  const user_input = body.user_input?.trim() ?? '';
  if (user_input.length < 5) {
    throw new BookListHttpError(400, 'user_input 长度至少为 5');
  }

  const analysis = await analyzeRequirement(user_input, {});
  const parsed = requirementAnalysisToParsed(analysis);
  const request_id = randomUUID();
  const session_id = stableIntFromString(request_id);

  await saveBookListParseSession(request_id, {
    original_input: user_input,
    parsed_requirements: parsed,
    created_at: Date.now(),
  });

  const confidence_score = analysis.needs_clarification ? 0.78 : 0.92;
  const suggestions = analysis.needs_clarification
    ? analysis.clarification_questions
    : analysis.preferences.slice(0, 5);

  return {
    request_id,
    session_id,
    original_input: user_input,
    parsed_requirements: parsed,
    confidence_score,
    suggestions,
    needs_confirmation: confidence_score < 0.9,
    message:
      confidence_score < 0.9
        ? '需求解析完成，请确认是否符合您的要求'
        : '需求解析完成，置信度较高',
  };
}

export async function generateBookList(
  body: GenerateBookListRequest,
): Promise<GenerateBookListResponse> {
  const limit = Math.min(100, Math.max(5, body.limit ?? 20));

  let requirements: ParsedRequirements;
  let requestId: string | null = body.request_id?.trim() || null;
  let userQuery: string;

  if (requestId) {
    const session = await getBookListParseSession(requestId);
    if (!session) {
      throw new BookListHttpError(400, `未找到请求 ID: ${requestId}`);
    }
    requirements = session.parsed_requirements;
    userQuery = session.original_input;
  } else if (body.requirements) {
    requirements = normalizeIncomingParsedRequirements(body.requirements);
    userQuery = buildUserQueryFromParsed(requirements, limit);
    requestId = null;
  } else {
    throw new BookListHttpError(400, '必须提供 request_id 或 requirements');
  }

  const started = Date.now();
  const useVercelSimplified = config.vercel.enabled && config.vercel.useSimplifiedPipeline;
  const timeoutMs = config.vercel.timeout ?? 9000;

  let recommendationBooks: RecommendedBook[] = [];
  let pipelineRequirement: Awaited<ReturnType<typeof runRAGPipeline>>['requirement'];
  let pipelineSuccess: boolean;
  let pipelineError: string | undefined;

  const pipelineTask = useVercelSimplified
    ? (async () => {
        const preReq = parsedRequirementsToRequirementAnalysis(userQuery, requirements, limit);
        preReq.constraints = { ...preReq.constraints, target_count: limit };

        const vercelResult = await runVercelRAGPipeline({
          userQuery,
          requirement: preReq,
          skipConversationMemory: true,
        });

        return {
          recommendationBooks: vercelResult.recommendation?.books ?? [],
          pipelineRequirement: vercelResult.requirement,
          pipelineSuccess: vercelResult.success,
          pipelineError: vercelResult.error,
        };
      })()
    : (async () => {
        const fullQuery = requestId ? `${userQuery}\n请推荐约 ${limit} 本书。` : userQuery;
        const classic = await runRAGPipeline({
          userQuery: fullQuery,
          enableConversationMemory: false,
          maxIterations: config.rag.maxIterations,
        });

        return {
          recommendationBooks: classic.recommendation?.books ?? [],
          pipelineRequirement: classic.requirement,
          pipelineSuccess: classic.success,
          pipelineError: classic.error,
        };
      })();

  const timeoutPromise = new Promise<never>(
    (_, reject) =>
      setTimeout(
        () => reject(new BookListHttpError(503, '生成书单超时')),
        timeoutMs,
      ),
  );

  const pipelineResult = await Promise.race([pipelineTask, timeoutPromise]);
  recommendationBooks = pipelineResult.recommendationBooks;
  pipelineRequirement = pipelineResult.pipelineRequirement;
  pipelineSuccess = pipelineResult.pipelineSuccess;
  pipelineError = pipelineResult.pipelineError;

  const sliced = recommendationBooks.slice(0, limit);
  const recommendations = sliced.map((b, i) =>
    recommendedBookToApiBook(b, Math.min(1, Math.max(0, (b.relevance_score ?? 0.9) - i * 0.02))),
  );

  const category_distribution: Record<string, number> = {};
  for (const b of sliced) {
    const cat = b.category || '未分类';
    category_distribution[cat] = (category_distribution[cat] || 0) + 1;
  }

  const finalRequirements = pipelineRequirement
    ? requirementAnalysisToParsed(pipelineRequirement)
    : requirements;

  const generation_time_ms = Date.now() - started;
  const success = Boolean(pipelineSuccess && recommendations.length > 0);
  const message = success
    ? `成功生成 ${recommendations.length} 本书的推荐书单`
    : pipelineError ||
      (recommendations.length === 0 ? '暂无可推荐的图书，请调整需求后重试' : '推荐流程未完成');

  return {
    request_id: requestId,
    session_id: requestId ? stableIntFromString(requestId) : null,
    book_list_id: null,
    requirements: finalRequirements,
    recommendations,
    total_count: recommendations.length,
    category_distribution,
    generation_time_ms,
    success,
    message,
  };
}
