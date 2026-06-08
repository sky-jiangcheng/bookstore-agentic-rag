import { analyzeRequirement } from './requirement-agent';
import { retrieveCandidates } from './retrieval-agent';
import { generateRecommendation } from './recommendation-agent';
import {
  addTurn,
  getConversationContext,
  getOrCreateSession,
} from '@/lib/conversation';
import config, { hasRedisConfig } from '@/lib/config/environment';
import type {
  AgentProgress,
  RecommendationResult,
  RequirementAnalysis,
  RetrievalResult,
} from '@/lib/types/rag';

export interface RAGPipelineOptions {
  userQuery: string;
  sessionId?: string;
  userId?: string;
  onProgress?: (progress: AgentProgress) => void;
  enableConversationMemory?: boolean;
  requirement?: RequirementAnalysis;
  limit?: number;
  excludeKeywords?: string[];
  categoryWeight?: number;
  keywordWeight?: number;
  libraryCategory?: string;
}

export interface RAGPipelineResult {
  success: boolean;
  requirement?: RequirementAnalysis;
  retrieval?: RetrievalResult;
  recommendation?: RecommendationResult;
  iterations: number;
  sessionId?: string;
  error?: string;
}

function getCandidateLimit(requirement: RequirementAnalysis): number {
  const targetCount = requirement.constraints.target_count ?? config.rag.defaultTargetCount;
  return Math.max(30, targetCount * 4);
}

export async function runRAGPipeline(
  options: RAGPipelineOptions,
): Promise<RAGPipelineResult> {
    const {
    userQuery,
    sessionId: inputSessionId,
    userId,
    onProgress,
    enableConversationMemory = true,
    requirement: precomputedRequirement,
    limit,
    excludeKeywords,
    categoryWeight,
    keywordWeight,
    libraryCategory,
  } = options;

  let requirement: RequirementAnalysis | undefined;
  let retrieval: RetrievalResult | undefined;
  let recommendation: RecommendationResult | undefined;

  const memoryEnabled =
    enableConversationMemory &&
    config.conversation.enabled &&
    hasRedisConfig();

  let session = null;
  if (memoryEnabled) {
    try {
      session = await getOrCreateSession(inputSessionId, userId);
    } catch (error) {
      console.warn('[pipeline] Conversation memory unavailable, continuing stateless:', error);
    }
  }

  const sessionId = session?.id;

  try {
    let conversationContext = '';
    if (session) {
      conversationContext = await getConversationContext(session.id, 3);
      await addTurn(session.id, {
        timestamp: Date.now(),
        role: 'user',
        content: userQuery,
      });
    }

    onProgress?.({
      type: 'phase_start',
      phase: 'requirement_analysis',
      content: precomputedRequirement ? '使用已解析需求' : '开始分析用户需求...',
    });

    requirement = precomputedRequirement
      ? {
          ...precomputedRequirement,
          original_query: precomputedRequirement.original_query || userQuery,
        }
      : await analyzeRequirement(userQuery, { conversationContext });

    // Apply front-end overrides
    if (limit !== undefined) {
      requirement.constraints.target_count = limit;
    }
    if (excludeKeywords !== undefined) {
      requirement.constraints.exclude_keywords = excludeKeywords;
    }

    onProgress?.({
      type: 'phase_complete',
      phase: 'requirement_analysis',
      content: '需求分析完成',
      data: requirement as unknown as Record<string, unknown>,
    });

    if (requirement.needs_clarification) {
      return {
        success: false,
        requirement,
        iterations: 1,
        sessionId,
        error: requirement.clarification_questions[0] || '需要补充更具体的选书需求',
      };
    }

    onProgress?.({
      type: 'phase_start',
      phase: 'retrieval',
      content: '开始检索候选书籍...',
    });

    retrieval = await retrieveCandidates(
      requirement,
      getCandidateLimit(requirement),
      { libraryCategory },
    );

    onProgress?.({
      type: 'phase_complete',
      phase: 'retrieval',
      content: `检索完成，找到 ${retrieval.total_candidates} 本候选书籍`,
      data: retrieval as unknown as Record<string, unknown>,
    });

    onProgress?.({
      type: 'phase_start',
      phase: 'generation',
      content: '开始生成推荐书单...',
    });

    recommendation = await generateRecommendation(requirement, retrieval.books, {
      categoryWeight,
      keywordWeight,
    });

    onProgress?.({
      type: 'phase_complete',
      phase: 'generation',
      content: `推荐生成完成，包含 ${recommendation.books.length} 本书`,
      data: recommendation as unknown as Record<string, unknown>,
    });

    if (session) {
      await addTurn(session.id, {
        timestamp: Date.now(),
        role: 'assistant',
        content: `为您推荐了 ${recommendation.books.length} 本书`,
        requirement,
        recommendations: recommendation.books,
      });
    }

    const success = recommendation.books.length > 0;
    return {
      success,
      requirement,
      retrieval,
      recommendation,
      iterations: 1,
      sessionId,
      error: success ? undefined : '没有找到满足条件的图书',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('[pipeline] Failed:', error);
    return {
      success: false,
      requirement,
      retrieval,
      recommendation,
      iterations: 1,
      sessionId,
      error: message,
    };
  }
}
