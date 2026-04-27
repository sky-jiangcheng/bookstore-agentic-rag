// lib/agents/orchestrator.ts
import config from '@/lib/config/environment';
import { analyzeRequirement } from './requirement-agent';
import { retrieveCandidates } from './retrieval-agent';
import { generateRecommendation } from './recommendation-agent';
import { evaluateRecommendation } from './reflection-agent';
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

  // Get or create conversation session
  let session = enableConversationMemory
    ? await getOrCreateSession(inputSessionId, userId)
    : null;

  const sessionId = session?.id;

  // Get conversation context for requirement analysis
  const conversationContext = session
    ? await getConversationContext(session.id, 3)
    : undefined;

  // Default retrieval strategies
  let retrievalStrategies: RetrievalStrategy[] = [
    { type: 'semantic', enabled: true, topK: 10 },
    { type: 'keyword', enabled: true, topK: 10 },
    { type: 'popular', enabled: true, topK: 10 },
  ];

  // Add user turn for the query
  if (session) {
    await addTurn(session.id, {
      timestamp: Date.now(),
      role: 'user',
      content: userQuery,
    });
  }

  try {
    // Step 1: Requirement Analysis
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

    // Check if clarification is needed
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

    // Iterative optimization loop
    while (iterations < maxIterations) {
      iterations++;

      if (iterations > 1) {
        onProgress?.({
          type: 'iteration_start',
          content: `开始优化迭代 ${iterations}`,
          data: { iteration: iterations } as unknown as Record<string, unknown>,
        });
      }

      // Step 2: Retrieval
      onProgress?.({
        type: 'phase_start',
        phase: 'retrieval',
        content: '开始检索候选书籍...',
      });
      retrieval = await retrieveCandidates(requirement, retrievalStrategies, {
        enableReranking,
        rerankerConfig: enableReranking ? {
          enabled: true,
          type: 'local', // Use mock reranker for now
          topK: Math.min(20, requirement.constraints.target_count || 5 * 2),
        } : undefined,
      });
      onProgress?.({
        type: 'phase_complete',
        phase: 'retrieval',
        content: `检索完成，找到 ${retrieval.total_candidates} 本候选书籍`,
        data: retrieval as unknown as Record<string, unknown>,
      });

      // Step 3: Recommendation Generation
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

      // Step 4: Evaluation
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

      // Check if optimization is needed
      if (!evaluation.needs_improvement) {
        // Add assistant turn for successful recommendation
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

      // Need optimization
      onProgress?.({
        type: 'optimization_needed',
        content: '推荐质量需要改进，准备优化...',
        data: {
          evaluation,
          iteration: iterations,
          maxIterations,
        } as unknown as Record<string, unknown>,
      });

      // Implement optimization logic based on evaluation suggestions
      for (const suggestion of evaluation.suggestions) {
        switch (suggestion.target) {
          case 'diversity':
            // Increase topK for semantic/keyword retrieval to get more candidates
            retrievalStrategies = retrievalStrategies.map(strategy => {
              if (strategy.type === 'semantic' || strategy.type === 'keyword') {
                return { ...strategy, topK: Math.min(strategy.topK + 5, 30) };
              }
              return strategy;
            });
            break;
          case 'budget':
            // Budget is a hard constraint: never relax user-provided upper bound.
            // Keep retrieval candidates broader instead of changing user constraints.
            retrievalStrategies = retrievalStrategies.map((strategy) => {
              if (strategy.type === 'semantic' || strategy.type === 'keyword') {
                return { ...strategy, topK: Math.min(strategy.topK + 5, 35) };
              }
              return strategy;
            });
            break;
          case 'requirement_match':
            // Add more keywords to retrieval for better requirement matching
            // We can extract additional keywords from the evaluation issues or suggestions
            const additionalKeywords = extractKeywordsFromSuggestions(evaluation.issues);
            requirement.keywords = [...new Set([...requirement.keywords, ...additionalKeywords])];
            break;
        }
      }
    }

    // Max iterations reached
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

// Helper function to extract keywords from evaluation issues
function extractKeywordsFromSuggestions(issues: string[]): string[] {
  // Simple keyword extraction from issues (can be enhanced with NLP)
  const keywords: string[] = [];
  const issueText = issues.join(' ');

  // Look for common book-related keywords
  const bookKeywords = ['科幻', '小说', '文学', '历史', '哲学', '经济', '管理', '科技', '计算机', '编程'];
  for (const keyword of bookKeywords) {
    if (issueText.includes(keyword)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}
