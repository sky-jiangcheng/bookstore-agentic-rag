import { NextRequest, NextResponse } from 'next/server';
import { runRAGPipeline, type RAGPipelineResult } from '@/lib/agents/orchestrator';
import { validateConfig, config } from '@/lib/config/environment';
import { runVercelRAGPipeline } from '@/lib/vercel/simplified-orchestrator';
import type { AgentProgress } from '@/lib/types/rag';

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function buildRecommendationSummary(result: RAGPipelineResult): string {
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

export async function POST(req: NextRequest) {
  try {
    // Validate configuration
    validateConfig();

    // Validate Content-Type
    if (req.headers.get('content-type') !== 'application/json') {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { query, sessionId } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required and must be a string' },
        { status: 400 }
      );
    }

    return await handleRequest(query, sessionId, req);
  } catch (error) {
    console.error('RAG API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Validate configuration
    validateConfig();

    // Get query from search parameters
    const url = new URL(req.url);
    const query = url.searchParams.get('query');
    const sessionId = url.searchParams.get('sessionId') || undefined;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required and must be a string' },
        { status: 400 }
      );
    }

    return await handleRequest(query, sessionId, req);
  } catch (error) {
    console.error('RAG API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function handleRequest(query: string, sessionId: string | undefined, req: NextRequest) {
  try {
    const useFastPipeline = config.vercel.enabled && config.vercel.useSimplifiedPipeline;

    if (useFastPipeline) {
      const result = await runVercelRAGPipeline({
        userQuery: query,
        sessionId,
      });
      const summary =
        result.success && result.recommendation && result.recommendation.books.length > 0
          ? `为你整理了 ${result.recommendation.books.length} 本候选图书。`
          : '这次没有找到足够明确的候选书，建议换个更具体的主题再试。';

      return NextResponse.json(
        {
          ...result,
          summary,
        },
        { status: result.success ? 200 : 500 }
      );
    }

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        // Handle request cancellation
        const onAbort = () => {
          controller.close();
        };
        req.signal.addEventListener('abort', onAbort);

        // Send progress events from the pipeline
        const onProgress = (progress: AgentProgress) => {
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
            controller.enqueue(encodeSseEvent('error', result));
          }
          controller.close();
        }).catch((error: Error) => {
          req.signal.removeEventListener('abort', onAbort);
          // Send error event
          controller.enqueue(encodeSseEvent('error', {
            success: false,
            error: error.message,
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
        'Access-Control-Allow-Origin': '*', // Allow CORS if needed
      },
    });
  } catch (error) {
    console.error('RAG API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
