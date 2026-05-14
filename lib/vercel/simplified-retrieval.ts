/**
 * Vercel-Optimized Retrieval Agent
 *
 * Simplified retrieval for serverless execution within time limits.
 * Removes complex multi-path retrieval and reranking.
 */

import { generateEmbeddingPair } from '@/lib/embeddings';
import { searchCatalog, getBookDetailsBatch } from '@/lib/clients/catalog-client';
import { vectorSearch, upsertBookVector } from '@/lib/upstash';
import type { Book, RequirementAnalysis, RetrievalResult } from '@/lib/types/rag';
import { filterBlockedBooks } from '@/lib/server/book-filters';

function applyHardConstraints(books: Book[], requirement: RequirementAnalysis): Book[] {
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];
  const keywords = requirement.keywords.map((keyword) => keyword.toLowerCase()).filter((keyword) => keyword.length >= 2);

  const constrained = books.filter((book) => {
    const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();

    if (excludedKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return false;
    }

    if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
      return false;
    }

    if (keywords.length > 0 && !keywords.some((keyword) => haystack.includes(keyword))) {
      return false;
    }

    return true;
  });

  if (constrained.length > 0) {
    return constrained;
  }

  return books.filter((book) => {
    const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();
    if (excludedKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return false;
    }
    if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
      return false;
    }
    return true;
  });
}

/**
 * Simplified retrieval for Vercel serverless
 * - Single-path retrieval (vector only)
 * - No reranking (time-consuming)
 * - Limited candidates (reduce processing time)
 */
export async function retrieveCandidatesVercel(
  requirement: RequirementAnalysis,
  options: {
    topK?: number;
    enableKeyword?: boolean;
  } = {}
): Promise<RetrievalResult> {
  const { topK = 10, enableKeyword = true } = options;

  const results: Book[] = [];
  const sources: ('semantic' | 'keyword' | 'popular')[] = [];

  // 1. Vector search (fastest for relevant results)
  try {
    const { vector, sparseVector } = generateEmbeddingPair(requirement.original_query);
    const vectorResults = await vectorSearch(vector, topK, sparseVector);

    const bookIds = Array.from(new Set(
      vectorResults
        .map((result) => result.metadata.bookId)
        .filter((bookId): bookId is string => typeof bookId === 'string' && bookId.length > 0)
    ));

    if (bookIds.length > 0) {
      const books = await getBookDetailsBatch(bookIds);
      const bookMap = new Map(books.map((book) => [book.book_id, book]));
      for (const bookId of bookIds) {
        const book = bookMap.get(bookId);
        if (book) {
          results.push(book);
        }
      }
    }

    sources.push('semantic');
  } catch (error) {
    console.warn('[retrieval] Vector search failed:', error);
  }

  // 2. Keyword search (only if needed and time permits)
  if (enableKeyword && results.length < topK) {
    try {
      const filters = {
        categories: requirement.categories.length > 0 ? requirement.categories : undefined,
        author: requirement.constraints.author,
        query: requirement.keywords.slice(0, 3).join(' '), // Limit keywords
      };

      const keywordResults = await searchCatalog(filters);
      const existingIds = new Set(results.map(b => b.book_id));

      for (const book of keywordResults) {
        if (!existingIds.has(book.book_id) && results.length < topK) {
          results.push(book);
        }
      }

      sources.push('keyword');
    } catch (error) {
      console.warn('[retrieval] Keyword search failed:', error);
    }
  }

  // 3. Fallback to popular if no results
  if (results.length === 0) {
    try {
      const { getPopularBooks } = await import('@/lib/clients/catalog-client');
      const popularBooks = await getPopularBooks(Math.min(5, topK));
      results.push(...popularBooks);
      sources.push('popular');
    } catch (error) {
      console.warn('[retrieval] Popular fallback failed:', error);
    }
  }

  const filteredResults = await filterBlockedBooks(results);
  const constrained = applyHardConstraints(filteredResults.books, requirement);

  return {
    books: constrained.slice(0, topK),
    sources,
    total_candidates: constrained.length,
  };
}

/**
 * Ultra-fast retrieval with minimal processing
 * Use when execution time is critical
 */
export async function fastRetrieval(
  query: string,
  topK: number = 5
): Promise<Book[]> {
  try {
    const { vector, sparseVector } = generateEmbeddingPair(query);
    const vectorResults = await vectorSearch(vector, topK, sparseVector);

    const bookIds = Array.from(new Set(
      vectorResults
        .map((result) => result.metadata.bookId)
        .filter((bookId): bookId is string => typeof bookId === 'string' && bookId.length > 0)
    ));
    const books = bookIds.length > 0 ? await getBookDetailsBatch(bookIds) : [];

    return (await filterBlockedBooks(books)).books;
  } catch (error) {
    console.error('[fastRetrieval] Failed:', error);
    return [];
  }
}

/**
 * Pre-compute and cache embeddings for all books
 * Run this during build/deployment, not at request time
 */
export async function precomputeEmbeddings(): Promise<void> {
  console.log('[precompute] Starting embedding pre-computation...');

  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`
      SELECT id, title, author, category
      FROM books
      LIMIT 500
    `;

    let computed = 0;
    for (const row of result.rows) {
      try {
        const bookId = String(row.id);
        const title = row.title as string;
        const author = row.author as string;
        const category = row.category as string;
        const text = `Title: ${title}\nAuthor: ${author}\nCategory: ${category}`;
        const { vector, sparseVector } = generateEmbeddingPair(text);

        await upsertBookVector(
          String(bookId),
          vector,
          { bookId, title, author, category, description: '' },
          sparseVector
        );

        computed++;
      } catch (error) {
        console.warn(`[precompute] Failed for book ${row.id}:`, error);
      }
    }

    console.log(`[precompute] Completed: ${computed} embeddings`);
  } catch (error) {
    console.error('[precompute] Failed:', error);
  }
}
