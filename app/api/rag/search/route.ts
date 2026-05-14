/**
 * Simple Vector Search API
 *
 * Lightweight endpoint that performs semantic vector search.
 * Returns JSON results compatible with local-platform's vector_search_tool.
 *
 * GET /api/rag/search?query=...&top_k=20
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbeddingPair } from '@/lib/embeddings';
import { vectorSearch } from '@/lib/upstash';
import { getBookDetailsBatch } from '@/lib/clients/catalog-client';
import { validateConfig } from '@/lib/config/environment';
import { corsHeaders, handleCorsPreflightRequest } from '@/lib/utils/cors';
import { buildSafeErrorResponse, logServerError } from '@/lib/utils/safe-error';
import { z } from 'zod';

/** 查询参数验证 schema */
const searchQuerySchema = z.object({
  query: z.string()
    .min(1, 'Query parameter is required')
    .max(500, 'Query too long (max 500 characters)')
    .transform((q) => q.trim()),
  top_k: z.coerce.number().int().min(1).max(50).default(20),
});

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflightRequest(req);
}

export async function GET(req: NextRequest) {
  try {
    validateConfig();

    const url = new URL(req.url);
    const parseResult = searchQuerySchema.safeParse({
      query: url.searchParams.get('query'),
      top_k: url.searchParams.get('top_k'),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400, headers: corsHeaders(req) }
      );
    }

    const { query, top_k } = parseResult.data;

    // Generate embedding from the query text
    const { vector, sparseVector } = generateEmbeddingPair(query.trim());

    // Search the vector index
    const searchResults = await vectorSearch(vector, top_k, sparseVector);

    // Extract book IDs for batch fetching
    const bookIds = searchResults.map((r) => r.metadata.bookId);

    // Fetch book details in batch (instead of N+1 individual fetches)
    const books = await getBookDetailsBatch(bookIds);

    // Build score map for relevance scoring
    const scoreMap = new Map(
      searchResults.map((r) => [r.metadata.bookId, r.score]),
    );

    // Combine book details with search scores
    const results = books.map((book) => ({
      book_id: book.book_id,
      title: book.title,
      author: book.author,
      category: book.category,
      relevance_score: scoreMap.get(book.book_id) ?? 0,
      source: 'vector',
    }));

    return NextResponse.json(
      { success: true, results },
      { headers: corsHeaders(req) }
    );
  } catch (error) {
    logServerError('[RAG Search]', error);
    return NextResponse.json(
      buildSafeErrorResponse(error, '搜索服务暂时不可用'),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
