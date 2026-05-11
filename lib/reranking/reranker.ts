/**
 * Reranker Module - Classic RAG Component
 *
 * Cross-encoder rerankers provide more accurate relevance scoring than
 * bi-encoder embeddings alone. This is a key component in production RAG systems.
 */

import type { Book } from '@/lib/types/rag';

export interface RerankerInput {
  query: string;
  documents: Array<{
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface RerankerOutput {
  results: Array<{
    id: string;
    score: number;
    index: number;
  }>;
}

export interface RerankerConfig {
  enabled: boolean;
  type: 'local' | 'api' | 'cohere' | 'jina';
  model?: string;
  apiKey?: string;
  topK?: number;
}

interface CohereRerankResult {
  document?: {
    id?: string | number;
  };
  relevance_score?: number;
  index?: number;
}

interface CohereRerankResponse {
  results?: CohereRerankResult[];
}

/**
 * Base Reranker interface
 */
export interface IReranker {
  name: string;
  rerank(input: RerankerInput, topK?: number): Promise<RerankerOutput>;
  isAvailable(): boolean;
}

/**
 * Mock Reranker - Fallback when no real reranker is configured
 * Uses simple keyword overlap as a proxy for relevance
 */
export class MockReranker implements IReranker {
  name = 'mock-reranker';

  async rerank(input: RerankerInput, topK: number = 10): Promise<RerankerOutput> {
    const queryTerms = this.extractTerms(input.query);
    const scored = input.documents.map((doc, index) => {
      const docTerms = this.extractTerms(doc.text);
      const score = this.computeOverlap(queryTerms, docTerms);
      return { id: doc.id, score, index };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
      results: scored.slice(0, topK).map((r, i) => ({
        ...r,
        index: i,
      })),
    };
  }

  isAvailable(): boolean {
    return true; // Always available as fallback
  }

  private extractTerms(text: string): Set<string> {
    const terms = text.toLowerCase().match(/\b\w+\b/g) || [];
    return new Set(terms);
  }

  private computeOverlap(queryTerms: Set<string>, docTerms: Set<string>): number {
    const intersection = new Set([...queryTerms].filter(t => docTerms.has(t)));
    const union = new Set([...queryTerms, ...docTerms]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * BGE Reranker - Local implementation (mock for Node.js)
 *
 * Note: True BGE reranker requires Python runtime. This is a placeholder
 * that provides the interface. For production, use:
 * - Python microservice with transformers library
 * - ONNX runtime with BGE ONNX model
 * - API-based reranker (Cohere, Jina)
 */
export class BGEReranker implements IReranker {
  name = 'bge-reranker';

  constructor(_config: RerankerConfig) {}

  async rerank(input: RerankerInput, topK: number = 10): Promise<RerankerOutput> {
    // For now, fall back to mock reranker
    // In production, this would call a Python service or use ONNX runtime
    console.warn('BGE Reranker: Using mock implementation. Install Python service for actual BGE reranking.');

    const mockReranker = new MockReranker();
    return mockReranker.rerank(input, topK);
  }

  isAvailable(): boolean {
    // BGE reranker requires a Python microservice or ONNX runtime,
    // which is not available in this Node.js environment.
    // Return false so the system falls back to MockReranker.
    return false;
  }
}

/**
 * Cohere Reranker - API-based implementation
 */
export class CohereReranker implements IReranker {
  name = 'cohere-reranker';
  private apiKey: string;
  private apiUrl = 'https://api.cohere.ai/v1/rerank';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async rerank(input: RerankerInput, topK: number = 10): Promise<RerankerOutput> {
    if (!this.apiKey) {
      throw new Error('Cohere API key is required');
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: input.query,
          documents: input.documents.map((doc, idx) => ({
            id: doc.id || String(idx),
            text: doc.text,
          })),
          top_n: topK,
          model: 'rerank-multilingual-v3.0',
        }),
      });

      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.statusText}`);
      }

      const data = (await response.json()) as CohereRerankResponse;
      if (!Array.isArray(data.results)) {
        return { results: [] };
      }

      return {
        results: data.results.flatMap((result, fallbackIndex) => {
          const documentId = result.document?.id;
          if (documentId === undefined || documentId === null) {
            return [];
          }

          return [
            {
              id: String(documentId),
              score: Number(result.relevance_score ?? 0),
              index: typeof result.index === 'number' ? result.index : fallbackIndex,
            },
          ];
        }),
      };
    } catch (error) {
      console.error('Cohere reranker error:', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

/**
 * Reranker Factory
 */
export function createReranker(config: RerankerConfig): IReranker {
  if (!config.enabled) {
    return new MockReranker();
  }

  switch (config.type) {
    case 'local':
      return new BGEReranker(config);

    case 'cohere':
      if (!config.apiKey) {
        console.warn('Cohere API key not provided, falling back to mock reranker');
        return new MockReranker();
      }
      return new CohereReranker(config.apiKey);

    case 'api':
    case 'jina':
      // For future implementation
      console.warn(`${config.type} reranker not yet implemented, using mock`);
      return new MockReranker();

    default:
      return new MockReranker();
  }
}

/**
 * Rerank books using the configured reranker
 */
export async function rerankBooks(
  query: string,
  books: Book[],
  config: RerankerConfig,
): Promise<Book[]> {
  if (books.length === 0) {
    return books;
  }

  const reranker = createReranker(config);

  if (!reranker.isAvailable()) {
    console.warn('Reranker not available, returning original order');
    return books;
  }

  // Prepare input for reranker
  const input: RerankerInput = {
    query,
    documents: books.map(book => ({
      id: String(book.book_id),
      text: `${book.title} by ${book.author}. ${book.category}. ${book.description}`,
      metadata: { bookId: book.book_id },
    })),
  };

  try {
    const output = await reranker.rerank(input, config.topK || books.length);

    // Reorder books based on reranker scores
    const rerankedMap = new Map(output.results.map(r => [r.id, r]));

    return books
      .map(book => ({
        book,
        rerankScore: rerankedMap.get(String(book.book_id))?.score || 0,
      }))
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .map(item => item.book);
  } catch (error) {
    console.error('Reranking failed, returning original order:', error);
    return books;
  }
}

/**
 * Compute RRF + Reranker hybrid score
 * Combines the RRF fusion score with reranker score for better ranking
 */
export function computeHybridScore(
  rrfScore: number,
  rerankScore: number,
  rrfWeight: number = 0.3,
): number {
  return rrfScore * rrfWeight + rerankScore * (1 - rrfWeight);
}
