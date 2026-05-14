/**
 * Vercel-Optimized RAG Chat API
 *
 * Simplified endpoint for Vercel free tier deployment.
 * Uses simplified orchestrator to stay within 10-second limit.
 */

import { NextRequest } from 'next/server';
import { runFastRAGPipeline } from '@/lib/vercel/simplified-orchestrator';
import { handleStreamingRequest } from '@/lib/vercel/rag-chat';
import { corsHeaders, handleCorsPreflightRequest } from '@/lib/utils/cors';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';
import { z } from 'zod';

const vercelChatSchema = z.object({
  query: z.string()
    .min(1, 'Query is required')
    .max(2000, 'Query too long (max 2000 characters)')
    .transform((q) => q.trim()),
  sessionId: z.string()
    .max(128, 'Session ID too long')
    .optional()
    .transform((s) => s?.trim() || undefined),
  fast: z.boolean().optional().default(false),
});

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflightRequest(req);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parseResult = vercelChatSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parseResult.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
      );
    }

    const { query, sessionId, fast } = parseResult.data;

    // Use fast pipeline for quicker responses
    if (fast) {
      const result = await runFastRAGPipeline(query, sessionId);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
      );
    }

    // Standard pipeline with SSE streaming
    return await handleStreamingRequest(query, sessionId, req);
  } catch (error) {
    logServerError('[VercelRAG]', error);
    return new Response(
      JSON.stringify(buildSafeErrorResponse(error, '处理请求时发生错误')),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
    );
  }
}
