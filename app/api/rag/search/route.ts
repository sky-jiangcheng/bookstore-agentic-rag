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

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function GET(req: NextRequest) {
  try {
    validateConfig();

    const url = new URL(req.url);
    const query = url.searchParams.get('query');
    const topK = Math.min(Math.max(1, Number(url.searchParams.get('top_k')) || 20), 50);

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query parameter is required' },
        { status: 400, headers: corsHeaders() }
      );
    }

    // Generate embedding from the query text
    const { vector, sparseVector } = generateEmbeddingPair(query.trim());

    // Search Upstash Vector for similar books
    const vectorResults = await vectorSearch(vector, topK, sparseVector);

    if (vectorResults.length === 0) {
      return NextResponse.json(
        { success: true, results: [] },
        { headers: corsHeaders() }
      );
    }

    // Fetch full book details for each result
    const ids = vectorResults.map((result) => result.id);
    const books = await getBookDetailsBatch(ids);

    // Build a score map from vector results
    const scoreMap = new Map<string, number>();
    for (const result of vectorResults) {
      scoreMap.set(result.id, result.score);
    }

    // Return results in the format expected by local-platform's vector_search_tool
    const results = books.map((book) => ({
      book_id: book.book_id,
      title: book.title,
      author: book.author,
      price: book.price,
      category: book.category,
      relevance_score: scoreMap.get(book.book_id) ?? 0,
      source: 'vector',
    }));

    return NextResponse.json(
      { success: true, results },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error('[RAG Search] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results: [],
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    { headers: corsHeaders() }
  );
}
