import { NextRequest, NextResponse } from 'next/server';
import { runRAGPipeline } from '@/lib/agents/orchestrator';
import type { RAGPipelineResult } from '@/lib/agents/orchestrator';
import { validateConfig, config } from '@/lib/config/environment';
import { runVercelRAGPipeline } from '@/lib/vercel/simplified-orchestrator';
import type { VercelRAGPipelineResult } from '@/lib/vercel/simplified-orchestrator';
import type { AgentProgress } from '@/lib/types/rag';
import { corsHeaders, handleCorsPreflightRequest } from '@/lib/utils/cors';
import { getSafeErrorMessage, buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';
import { z } from 'zod';

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * 请求体验证 schema。
 * 防止超长输入、空查询、非字符串类型等安全问题。
 */
const chatRequestSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query too long (max 2000 characters)')
    .transform((q) => q.trim()),
  sessionId: z.string()
    .max(128, 'Session ID too long')
    .optional()
    .transform((s) => s?.trim() || undefined),
});

/** 通用推荐摘要构建（兼容两种 pipeline 结果类型） */
function buildRecommendationSummary(result: RAGPipelineResult | VercelRAGPipelineResult): string {
  if (!result.recommendation || result.recommendation.books.length === 0) {
    return '目前没有检索到足够的真实图书数据，暂时无法生成可信推荐。';
  }

  const requirement = result.requirement;
  const budget = requirement?.constraints.budget;
  const totalPrice = result.recommendation.total_price;
  const excludedKeywords = requirement?.constraints.exclude_keywords ?? [];

  const hardConstraintNotes: string[] = [];
  if (budget !== undefined) {
    hardConstraintNotes.push(`预算约束：¥${totalPrice.toFixed(2)} / ¥${budget.toFixed(2)}（${totalPrice <= budget ? '已满足' : '未满足'}）`);
  }
  if (requirement?.categories?.length) {
    hardConstraintNotes.push(`分类约束：${requirement.categories.join('、')}`);
  }
  if (excludedKeywords.length > 0) {
    hardConstraintNotes.push(`排除词约束：${excludedKeywords.join('、')}`);
  }

  const bookLines = result.recommendation.books.map((book, index) =>
    `${index + 1}. ${book.title} - ${book.author}\n${book.explanation}`
  );

  return [
    `为你整理了 ${result.recommendation.books.length} 本候选图书：`,
    ...(hardConstraintNotes.length > 0 ? [`硬约束执行结果：${hardConstraintNotes.join('；')}`] : []),
    ...bookLines,
  ].join('\n\n');
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflightRequest(req);
}

export async function POST(req: NextRequest) {
  try {
    // Validate configuration
    validateConfig();

    // Validate Content-Type
    if (req.headers.get('content-type') !== 'application/json') {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers: corsHeaders(req) }
      );
    }

    // Parse and validate request body with Zod
    const rawBody = await req.json();
    const parseResult = chatRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    const { query, sessionId } = parseResult.data;

    return await handleRequest(query, sessionId, req);
  } catch (error) {
    logServerError('[RAG Chat]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '处理请求时发生错误'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

async function handleRequest(query: string, sessionId: string | undefined, req: NextRequest) {
  try {
    // Determine which pipeline to use
    const useVercelPipeline = config.vercel.enabled && config.vercel.useSimplifiedPipeline;

    if (!useVercelPipeline) {
      // Full RAG Pipeline (non-Vercel)
      return await handleFullPipeline(query, sessionId, req);
    }

    // Vercel Simplified Pipeline
    const result = await runVercelRAGPipeline({ userQuery: query, sessionId });
    return NextResponse.json(
      { ...result, summary: buildRecommendationSummary(result) },
      { headers: corsHeaders(req) }
    );
  } catch (error) {
    logServerError('[RAG Chat]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '处理请求时发生错误'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}

async function handleFullPipeline(query: string, sessionId: string | undefined, req: NextRequest) {
  try {
    // Set up SSE streaming
    const stream = new ReadableStream({
      start(controller) {
        let aborted = false;

        const onAbort = () => {
          aborted = true;
          controller.close();
        };
        req.signal.addEventListener('abort', onAbort);

        const onProgress: (progress: AgentProgress) => void = (progress) => {
          if (aborted) return;
          controller.enqueue(encodeSseEvent('progress', progress));
        };

        // Run the full RAG pipeline for the SSE path
        const pipelinePromise = runRAGPipeline({
          userQuery: query,
          sessionId,
          enableConversationMemory: true,
          enableReranking: true,
          onProgress,
        });

        pipelinePromise.then((result: RAGPipelineResult) => {
          req.signal.removeEventListener('abort', onAbort);
          // Send appropriate event based on result
          if (result.success) {
            controller.enqueue(encodeSseEvent('complete', {
              ...result,
              summary: buildRecommendationSummary(result),
            }));
          } else {
            controller.enqueue(encodeSseEvent('error', {
              ...result,
              // Sanitize error message for SSE events too
              error: getSafeErrorMessage(result.error),
            }));
          }
          controller.close();
        }).catch((error: Error) => {
          req.signal.removeEventListener('abort', onAbort);
          // Send error event — use safe message
          controller.enqueue(encodeSseEvent('error', {
            success: false,
            error: getSafeErrorMessage(error),
            iterations: 0,
          }));
          controller.close();
        });
      },
    });

    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders(req),
      },
    });
  } catch (error) {
    logServerError('[RAG Chat SSE]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '处理请求时发生错误'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
