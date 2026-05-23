import config from '@/lib/config/environment';
import { analyzeRequirement } from './requirement-agent';
import { retrieveCandidates } from './retrieval-agent';
import { generateRecommendation } from './recommendation-agent';
import { evaluateRecommendation } from './reflection-agent';
import { extractKnownBookKeywords } from './book-taxonomy';
import {
  getOrCreateSession,
  addTurn,
  getConversationContext,
} from '@/lib/conversation';
import type {
  AgentProgress,
  RequirementAnalysis,
  RetrievalResult,
  RecommendationResult,
  EvaluationResult,
} from '@/lib/types/rag';
import type { RetrievalStrategy } from './retrieval-agent';

export interface RAGPipelineOptions {
  userQuery: string;
  sessionId?: string;
  userId?: string;
  onProgress?: (progress: AgentProgress) => void;
  maxIterations?: number;
  enableReranking?: boolean;
  enableConversationMemory?: boolean;
}

export interface RAGPipelineResult {
  success: boolean;
  requirement?: RequirementAnalysis;
  retrieval?: RetrievalResult;
  recommendation?: RecommendationResult;
  evaluation?: EvaluationResult;
  iterations: number;
  sessionId?: string;
  error?: string;
}

/**
 * 运行完整的RAG管道
 *
 * 管道包含以下阶段：
 * 1. 需求分析 - 解析用户查询，理解用户意图
 * 2. 检索 - 从向量数据库和目录服务检索候选项
 * 3. 生成 - 基于需求和候选项生成推荐
 * 4. 评估 - 评估推荐质量，决定是否需要迭代优化
 *
 * @param options - RAG管道配置选项
 * @returns 包含管道执行结果的最终响应
 */
export async function runRAGPipeline(
  options: RAGPipelineOptions
): Promise<RAGPipelineResult> {
  const {
    userQuery,
    sessionId: inputSessionId,
    userId,
    onProgress,
    maxIterations = config.rag.maxIterations,
    enableReranking = true,
    enableConversationMemory = true,
  } = options;

  let iterations = 0;
  let error: string | undefined;
  let requirement: RequirementAnalysis | undefined;
  let retrieval: RetrievalResult | undefined;
  let recommendation: RecommendationResult | undefined;
  let evaluation: EvaluationResult | undefined;

  let session = enableConversationMemory
    ? await getOrCreateSession(inputSessionId, userId)
    : null;

  const sessionId = session?.id;

  const conversationContext = session
    ? await getConversationContext(session.id, 3)
    : undefined;

  let retrievalStrategies: RetrievalStrategy[] = [
    { type: 'semantic', enabled: true, topK: 10 },
    { type: 'keyword', enabled: true, topK: 10 },
    { type: 'popular', enabled: true, topK: 10 },
  ];

  if (session) {
    await addTurn(session.id, {
      timestamp: Date.now(),
      role: 'user',
      content: userQuery,
    });
  }

  try {
    onProgress?.({
      type: 'phase_start',
      phase: 'requirement_analysis',
      content: '开始分析用户需求...',
    });
    const requirementResult = await analyzeRequirement(userQuery, {
      conversationContext,
    });
    requirement = requirementResult;
    onProgress?.({
      type: 'phase_complete',
      phase: 'requirement_analysis',
      content: '需求分析完成',
      data: requirementResult as unknown as Record<string, unknown>,
    });

    if (requirement.needs_clarification) {
      onProgress?.({
        type: 'error',
        content: '需要澄清用户需求',
        data: requirement.clarification_questions as unknown as Record<string, unknown>,
      });

      return {
        success: false,
        requirement,
        iterations: 0,
        error: '需要澄清用户需求',
      };
    }

    while (iterations < maxIterations) {
      iterations++;

      if (iterations > 1) {
        onProgress?.({
          type: 'iteration_start',
          content: `开始优化迭代 ${iterations}`,
          data: { iteration: iterations } as unknown as Record<string, unknown>,
        });
      }

      onProgress?.({
        type: 'phase_start',
        phase: 'retrieval',
        content: '开始检索候选书籍...',
      });
      retrieval = await retrieveCandidates(requirement, retrievalStrategies, {
        enableReranking,
        rerankerConfig: enableReranking ? {
          enabled: true,
          type: 'local',
          topK: Math.min(20, requirement.constraints.target_count || 5 * 2),
        } : undefined,
      });
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
      recommendation = await generateRecommendation(
        requirement,
        retrieval.books
      );
      onProgress?.({
        type: 'phase_complete',
        phase: 'generation',
        content: `推荐生成完成，包含 ${recommendation.books.length} 本书`,
        data: recommendation as unknown as Record<string, unknown>,
      });

      onProgress?.({
        type: 'phase_start',
        phase: 'evaluation',
        content: '开始评估推荐质量...',
      });
      evaluation = await evaluateRecommendation(
        requirement,
        recommendation
      );
      onProgress?.({
        type: 'phase_complete',
        phase: 'evaluation',
        content: `评估完成，总体评分: ${(evaluation.overall_score * 100).toFixed(0)}分`,
        data: evaluation as unknown as Record<string, unknown>,
      });

      if (!evaluation.needs_improvement) {
        if (session && recommendation) {
          await addTurn(session.id, {
            timestamp: Date.now(),
            role: 'assistant',
            content: `为您推荐了 ${recommendation.books.length} 本书`,
            requirement,
            recommendations: recommendation.books,
          });
        }

        onProgress?.({
          type: 'complete',
          content: '推荐质量达标，流程完成',
          data: {
            requirement,
            retrieval,
            recommendation,
            evaluation,
            iterations,
            sessionId,
          } as unknown as Record<string, unknown>,
        });

        return {
          success: true,
          requirement,
          retrieval,
          recommendation,
          evaluation,
          iterations,
          sessionId,
        };
      }

      onProgress?.({
        type: 'optimization_needed',
        content: '推荐质量需要改进，准备优化...',
        data: {
          evaluation,
          iteration: iterations,
          maxIterations,
        } as unknown as Record<string, unknown>,
      });

      for (const suggestion of evaluation.suggestions) {
        switch (suggestion.target) {
          case 'diversity':
            retrievalStrategies = retrievalStrategies.map(strategy => {
              if (strategy.type === 'semantic' || strategy.type === 'keyword') {
                return { ...strategy, topK: Math.min(strategy.topK + 5, 30) };
              }
              return strategy;
            });
            break;
          case 'budget':
            retrievalStrategies = retrievalStrategies.map((strategy) => {
              if (strategy.type === 'semantic' || strategy.type === 'keyword') {
                return { ...strategy, topK: Math.min(strategy.topK + 5, 35) };
              }
              return strategy;
            });
            break;
          case 'requirement_match':
            const additionalKeywords = extractKeywordsFromSuggestions(evaluation.issues);
            requirement.keywords = [...new Set([...requirement.keywords, ...additionalKeywords])];
            break;
        }
      }
    }

    onProgress?.({
      type: 'error',
      content: `已达到最大迭代次数 (${maxIterations})，返回当前结果`,
      data: {
        requirement,
        retrieval,
        recommendation,
        evaluation,
        iterations,
      } as unknown as Record<string, unknown>,
    });

    return {
      success: false,
      requirement,
      retrieval,
      recommendation,
      evaluation,
      iterations,
      error: `已达到最大迭代次数 (${maxIterations})，推荐质量仍需改进`,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : '未知错误';
    onProgress?.({
      type: 'error',
      content: `流程执行失败: ${error}`,
      data: { error, iterations } as unknown as Record<string, unknown>,
    });

    return {
      success: false,
      requirement,
      retrieval,
      recommendation,
      evaluation,
      iterations,
      error,
    };
  }
}

/**
 * 从评估建议中提取关键词
 *
 * @param issues - 评估问题列表
 * @returns 提取的关键词数组
 */
function extractKeywordsFromSuggestions(issues: string[]): string[] {
  const issueText = issues.join(' ');
  return extractKnownBookKeywords(issueText);
}
