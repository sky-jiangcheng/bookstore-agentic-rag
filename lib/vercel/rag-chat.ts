import type { NextRequest } from 'next/server';

import type { AgentProgress } from '@/lib/types/rag';
import { runVercelRAGPipeline } from './simplified-orchestrator';
import { corsHeaders } from '@/lib/utils/cors';
import { getSafeErrorMessage } from '@/lib/utils/safe-error';
import { buildRecommendationSummary } from '@/lib/utils/recommendation-summary';

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
            controller.enqueue(encodeSseEvent('error', {
              ...result,
              error: getSafeErrorMessage(result.error),
            }));
          }

          closeStream();
        })
        .catch((error: Error) => {
          req.signal.removeEventListener('abort', onAbort);
          if (!isClosed) {
            controller.enqueue(
              encodeSseEvent('error', {
                success: false,
                error: getSafeErrorMessage(error),
                iterations: 0,
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
      ...corsHeaders(req),
    },
  });
}

export { buildRecommendationSummary };
