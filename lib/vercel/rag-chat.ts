import type { NextRequest } from 'next/server';

import type { VercelRAGPipelineResult } from './simplified-orchestrator';
import type { AgentProgress } from '@/lib/types/rag';
import { runVercelRAGPipeline } from './simplified-orchestrator';

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function handleStreamingRequest(
  query: string,
  sessionId: string | undefined,
  req: NextRequest
) {
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      const closeStream = () => {
        if (!isClosed) {
          isClosed = true;
          controller.close();
        }
      };

      const onAbort = () => {
        closeStream();
      };
      req.signal.addEventListener('abort', onAbort);

      const onProgress = (progress: AgentProgress) => {
        try {
          if (!isClosed) {
            controller.enqueue(encodeSseEvent('progress', progress));
          }
        } catch (error) {
          console.warn('[SSE] Failed to send progress:', error);
        }
      };

      runVercelRAGPipeline({
        userQuery: query,
        sessionId,
        onProgress,
      })
        .then((result) => {
          req.signal.removeEventListener('abort', onAbort);

          if (result.success && result.recommendation) {
            const summary = buildRecommendationSummary(result);
            if (!isClosed) {
              controller.enqueue(
                encodeSseEvent('complete', {
                  ...result,
                  summary,
                })
              );
            }
          } else if (!isClosed) {
            controller.enqueue(encodeSseEvent('error', result));
          }

          closeStream();
        })
        .catch((error: Error) => {
          req.signal.removeEventListener('abort', onAbort);
          if (!isClosed) {
            controller.enqueue(
              encodeSseEvent('error', {
                success: false,
                error: error.message,
              })
            );
          }
          closeStream();
        });

      setTimeout(() => {
        if (!isClosed) {
          console.warn('[VercelRAG] Timeout, closing stream');
          controller.enqueue(
            encodeSseEvent('error', {
              success: false,
              error: 'Request timeout',
            })
          );
          closeStream();
        }
      }, 9000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function buildRecommendationSummary(result: VercelRAGPipelineResult): string {
  if (!result.recommendation || result.recommendation.books.length === 0) {
    return '抱歉，没有找到相关书籍。';
  }

  const budget = result.requirement?.constraints?.budget;
  const totalPrice = Number(result.recommendation?.total_price ?? 0);
  const excludedKeywords = result.requirement?.constraints?.exclude_keywords ?? [];
  const hardConstraintNotes: string[] = [];

  if (typeof budget === 'number') {
    hardConstraintNotes.push(`预算约束：¥${totalPrice.toFixed(2)} / ¥${budget.toFixed(2)}（${totalPrice <= budget ? '已满足' : '未满足'}）`);
  }
  if (Array.isArray(result.requirement?.categories) && result.requirement.categories.length > 0) {
    hardConstraintNotes.push(`分类约束：${result.requirement.categories.join('、')}`);
  }
  if (Array.isArray(excludedKeywords) && excludedKeywords.length > 0) {
    hardConstraintNotes.push(`排除词约束：${excludedKeywords.join('、')}`);
  }

  const bookLines = result.recommendation.books.map(
    (book, index) =>
      `${index + 1}. ${book.title} - ${book.author}\n${book.explanation}`
  );

  return [
    `为你推荐 ${result.recommendation.books.length} 本书:`,
    ...(hardConstraintNotes.length > 0 ? [`硬约束执行结果：${hardConstraintNotes.join('；')}`] : []),
    ...bookLines,
  ].join('\n\n');
}
