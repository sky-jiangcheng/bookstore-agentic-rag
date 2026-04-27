/**
 * Vercel-Optimized RAG Chat API
 *
 * Simplified endpoint for Vercel free tier deployment.
 * Uses simplified orchestrator to stay within 10-second limit.
 */

import { NextRequest } from 'next/server';
import { runFastRAGPipeline } from '@/lib/vercel/simplified-orchestrator';
import { handleStreamingRequest } from '@/lib/vercel/rag-chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, sessionId, fast = false } = body;

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use fast pipeline for quicker responses
    if (fast) {
      const result = await runFastRAGPipeline(query, sessionId);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Standard pipeline with SSE streaming
    return await handleStreamingRequest(query, sessionId, req);
  } catch (error) {
    console.error('[VercelRAG] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
