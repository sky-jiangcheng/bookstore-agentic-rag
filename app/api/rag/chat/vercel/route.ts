import { NextRequest, NextResponse } from 'next/server';
import { runRAGPipeline } from '@/lib/agents/orchestrator';
import { handleStreamingRequest } from '@/lib/vercel/rag-chat';
import { corsHeaders, handleCorsPreflightRequest } from '@/lib/utils/cors';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';
import { buildRecommendationSummary } from '@/lib/utils/recommendation-summary';
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
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers: corsHeaders(req) }
      );
    }

    const rawBody = await req.json();
    const parseResult = vercelChatSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    const { query, sessionId, fast } = parseResult.data;

    if (fast) {
      const result = await runRAGPipeline({
        userQuery: query,
        sessionId,
        enableConversationMemory: true,
      });
      return NextResponse.json(
        { ...result, summary: buildRecommendationSummary(result) },
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
      );
    }

    return await handleStreamingRequest(query, sessionId, req);
  } catch (error) {
    logServerError('[VercelRAG]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '处理请求时发生错误'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
