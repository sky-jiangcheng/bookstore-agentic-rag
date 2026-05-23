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
import { logServerError } from '@/lib/utils/safe-error';

export class BookListHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BookListHttpError';
  }
}

/**
 * 规范化输入的需求参数
 * 确保类别百分比在有效范围内，关键词和约束非空
 */
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

/**
 * 解析用户输入的阅读需求
 * 使用LLM分析用户需求，生成结构化的需求描述
 *
 * @param body - 包含用户输入的请求体
 * @returns 结构化的需求解析结果
 * @throws BookListHttpError - 当输入过短或解析失败时
 */
export async function parseBookListRequirements(
  body: ParseRequirementsRequest,
): Promise<ParseRequirementsResponse> {
  const user_input = body.user_input?.trim() ?? '';

  if (user_input.length < 5) {
    throw new BookListHttpError(400, 'user_input 长度至少为 5');
  }

  try {
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
  } catch (error) {
    logServerError('[book-list/parse]', error);
    throw new BookListHttpError(500, '需求解析失败，请稍后重试');
  }
}

/**
 * 生成推荐书单
 * 根据用户需求（通过request_id关联会话或直接传入）生成个性化书籍推荐
 *
 * @param body - 生成书单的请求参数
 * @returns 包含推荐书籍列表的响应
 * @throws BookListHttpError - 当请求无效、超时或服务不可用时
 */
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
        try {
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
        } catch (error) {
          logServerError('[book-list/generate/vercel]', error);
          throw error;
        }
      })()
    : (async () => {
        try {
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
        } catch (error) {
          logServerError('[book-list/generate/classic]', error);
          throw error;
        }
      })();

  const timeoutPromise = new Promise<never>(
    (_, reject) =>
      setTimeout(
        () => reject(new BookListHttpError(503, '生成书单超时')),
        timeoutMs,
      ),
  );

  try {
    const pipelineResult = await Promise.race([pipelineTask, timeoutPromise]);
    recommendationBooks = pipelineResult.recommendationBooks;
    pipelineRequirement = pipelineResult.pipelineRequirement;
    pipelineSuccess = pipelineResult.pipelineSuccess;
    pipelineError = pipelineResult.pipelineError;
  } catch (error) {
    if (error instanceof BookListHttpError) {
      throw error;
    }
    logServerError('[book-list/generate]', error);
    throw new BookListHttpError(500, '生成书单时发生内部错误');
  }

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
