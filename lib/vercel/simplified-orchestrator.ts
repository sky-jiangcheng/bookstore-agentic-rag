/**
 * Vercel-Optimized RAG Pipeline
 *
 * Simplified orchestrator for serverless execution within 10-second limit.
 * Removes complex iteration and evaluation for faster execution.
 */

import crypto from 'crypto';
import { analyzeRequirement } from '@/lib/agents/requirement-agent';
import { generateRecommendation } from '@/lib/agents/recommendation-agent';
import { conversationMemory } from '@/lib/vercel/storage';
import { fastRetrieval, retrieveCandidatesVercel } from '@/lib/vercel/simplified-retrieval';
import type {
  AgentProgress,
  Book,
  RequirementAnalysis,
  RetrievalResult,
  RecommendationResult,
} from '@/lib/types/rag';

export interface VercelRAGPipelineOptions {
  userQuery: string;
  sessionId?: string;
  onProgress?: (progress: AgentProgress) => void;
  /**
   * When set, skips LLM requirement analysis (e.g. book-list generate after parse).
   * Retrieval still uses `userQuery` for embedding / hybrid search.
   */
  requirement?: RequirementAnalysis;
  /**
   * When true, does not allocate an anonymous session or persist conversation turns
   * (avoids Redis chatter for stateless BFF calls such as book-list generate).
   */
  skipConversationMemory?: boolean;
}

export interface VercelRAGPipelineResult {
  success: boolean;
  requirement?: RequirementAnalysis;
  retrieval?: RetrievalResult;
  recommendation?: RecommendationResult;
  sessionId?: string;
  error?: string;
}

/**
 * Simplified RAG pipeline for Vercel serverless
 * - Single-pass execution (no iteration)
 * - Minimal async operations
 * - Fast fallback on errors
 */
export async function runVercelRAGPipeline(
  options: VercelRAGPipelineOptions
): Promise<VercelRAGPipelineResult> {
  const startTime = Date.now();
  const {
    userQuery,
    sessionId: inputSessionId,
    onProgress,
    requirement: precomputedRequirement,
    skipConversationMemory = false,
  } = options;

  let sessionId = inputSessionId;
  let requirement: RequirementAnalysis | undefined;
  let retrieval: RetrievalResult | undefined;
  let recommendation: RecommendationResult | undefined;

  try {
    if (!skipConversationMemory) {
      if (!sessionId) {
        sessionId = `sess-${crypto.randomUUID()}`;
      }
    }

    let conversationContext = '';
    if (!skipConversationMemory && sessionId) {
      try {
        conversationContext = await conversationMemory.getContext(sessionId, 2);
      } catch (error) {
        console.warn('[pipeline] Failed to get conversation context:', error);
      }
    }

    onProgress?.({
      type: 'phase_start',
      phase: 'requirement_analysis',
      content: precomputedRequirement ? '使用已解析需求' : '分析需求...',
    });

    if (precomputedRequirement) {
      requirement = {
        ...precomputedRequirement,
        original_query: precomputedRequirement.original_query || userQuery,
      };
    } else {
      requirement = await analyzeRequirement(userQuery, { conversationContext });
    }

    onProgress?.({
      type: 'phase_complete',
      phase: 'requirement_analysis',
      content: '需求分析完成',
      data: requirement as unknown as Record<string, unknown>,
    });

    // Check execution time
    if (Date.now() - startTime > 5000) {
      console.warn('[pipeline] Taking too long, simplifying...');
    }

    // Step 4: Retrieve candidates (simplified)
    onProgress?.({
      type: 'phase_start',
      phase: 'retrieval',
      content: '检索书籍...',
    });

    const targetCount = requirement.constraints.target_count ?? 5;
    const candidateTopK = Math.max(targetCount * 3, 12);

    // Run primary and fallback retrieval in parallel to cut latency
    const [primaryCandidates, fallbackRetrieval] = await Promise.all([
      fastRetrieval(userQuery, candidateTopK),
      retrieveCandidatesVercel(requirement, {
        topK: candidateTopK,
        enableKeyword: true,
      }).catch((error) => {
        console.warn('[pipeline] Fallback retrieval failed:', error);
        return { books: [], sources: [], total_candidates: 0 } as RetrievalResult;
      }),
    ]);

    const merged = new Map<string, Book>();
    for (const book of primaryCandidates) {
      merged.set(book.book_id, book);
    }
    for (const book of fallbackRetrieval.books) {
      if (!merged.has(book.book_id)) {
        merged.set(book.book_id, book);
      }
    }

    let candidatePool = Array.from(merged.values());

    retrieval = {
      books: candidatePool.slice(0, candidateTopK),
      sources: ['semantic'],
      total_candidates: candidatePool.length,
    };

    onProgress?.({
      type: 'phase_complete',
      phase: 'retrieval',
      content: `找到 ${retrieval.total_candidates} 本候选书籍`,
      data: retrieval as unknown as Record<string, unknown>,
    });

    // Step 5: Generate recommendation (skip if running out of time)
    const elapsedRetrieval = Date.now() - startTime;
    if (elapsedRetrieval > 5000) {
      // Running short on time — skip LLM generation, return ranked candidates
      console.warn(`[pipeline] ${elapsedRetrieval}ms elapsed, skipping LLM generation, returning ranked candidates`);
      recommendation = {
        books: retrieval.books.slice(0, Math.max(targetCount, 5)).map(book => ({
          ...book,
          explanation: '基于您的需求找到的相关书籍。',
        })),
        total_price: retrieval.books.reduce((sum, b) => sum + b.price, 0),
        quality_score: 0.8,
        confidence: 0.7,
        category_distribution: {},
      };
    } else {
      onProgress?.({
        type: 'phase_start',
        phase: 'generation',
        content: '生成推荐...',
      });

      recommendation = await generateRecommendation(requirement, retrieval.books);
    }

    onProgress?.({
      type: 'phase_complete',
      phase: 'generation',
      content: `推荐 ${recommendation.books.length} 本书`,
      data: recommendation as unknown as Record<string, unknown>,
    });

    if (!skipConversationMemory && sessionId) {
      try {
        await conversationMemory.addTurn(sessionId, 'user', userQuery);
        await conversationMemory.addTurn(
          sessionId,
          'assistant',
          `推荐了 ${recommendation.books.length} 本书`
        );
      } catch (error) {
        console.warn('[pipeline] Failed to store conversation:', error);
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[pipeline] Completed in ${executionTime}ms`);

    return {
      success: true,
      requirement,
      retrieval,
      recommendation,
      sessionId,
    };
  } catch (error) {
    console.error('[pipeline] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
    };
  }
}

/**
 * Even faster pipeline for edge cases
 * Skips some processing for sub-3 second execution
 */
export async function runFastRAGPipeline(
  query: string,
  sessionId?: string
): Promise<VercelRAGPipelineResult> {
  try {
    const requirement = await analyzeRequirement(query, {});
    const candidateTopK = Math.max((requirement.constraints.target_count ?? 5) * 4, 16);
    const retrieval = await retrieveCandidatesVercel(requirement, {
      topK: candidateTopK,
      enableKeyword: true,
    });

    // Simple recommendation (no LLM)
    const recommendation = {
      books: retrieval.books.map(book => ({
        ...book,
        explanation: '基于您的查询找到的相关书籍。',
      })),
      total_price: retrieval.books.reduce((sum, b) => sum + b.price, 0),
      quality_score: 0.8,
      confidence: 0.7,
      category_distribution: {},
    };

    // Store minimal context
    if (sessionId) {
      try {
        await conversationMemory.addTurn(sessionId, 'user', query);
        await conversationMemory.addTurn(sessionId, 'assistant', `推荐 ${retrieval.books.length} 本书`);
      } catch {
        // Ignore storage errors
      }
    }

    return {
      success: true,
      requirement,
      retrieval,
      recommendation,
      sessionId,
    };
  } catch (error) {
    console.error('[fastPipeline] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
    };
  }
}
