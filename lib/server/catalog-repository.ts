import 'server-only';

import { sql } from '@vercel/postgres';

import { buildCatalogTextSearch, SIMPLE_RERANK_THRESHOLD } from '@/lib/search/catalog-query';
import { buildCatalogSearchTerms, rerankCatalogBooks } from '@/lib/search/query-rerank';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';



interface CatalogApiBook {
  book_id?: string | number;
  id?: string | number;
  title: string;
  author?: string | null;
  publisher?: string | null;
  price?: number | null;
  stock?: number | null;
  category?: string | null;
  description?: string | null;
  cover_url?: string | null;
  relevance_score?: number | null;
}

function mapBook(record: CatalogApiBook): Book {
  const bookId = record.book_id ?? record.id;
  if (!bookId) {
    throw new Error('Catalog record is missing book_id');
  }

  return {
    book_id: String(bookId),
    title: record.title,
    author: record.author ?? 'Unknown Author',
    publisher: record.publisher ?? 'Unknown Publisher',
    price: Number(record.price ?? 0),
    stock: Number(record.stock ?? 0),
    category: record.category ?? 'general',
    description: record.description ?? '',
    cover_url: record.cover_url ?? undefined,
    relevance_score: Number(record.relevance_score ?? 0),
  };
}

function normalizeBooks(records: CatalogApiBook[]): Book[] {
  return records.map(mapBook);
}

/**
 * 搜索目录：关键词 ILIKE 搜索 + 筛选。
 * query 来自用户自由文本，无 query 时仅按筛选条件返回热门图书。
 */
export async function searchCatalogFromDatabase(filters: CatalogSearchFilters): Promise<Book[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const searchTerms = filters.search_terms?.length
    ? filters.search_terms
    : buildCatalogSearchTerms(filters.query ?? '');
  const textSearch = buildCatalogTextSearch(searchTerms, params.length + 1);
  if (textSearch.condition) {
    conditions.push(textSearch.condition);
    params.push(...textSearch.params);
  }

  if (filters.author) {
    params.push(`%${filters.author}%`);
    conditions.push(`author ILIKE $${params.length}`);
  }
  if (filters.price_min !== undefined) {
    params.push(filters.price_min);
    conditions.push(`price >= $${params.length}`);
  }
  if (filters.price_max !== undefined) {
    params.push(filters.price_max);
    conditions.push(`price <= $${params.length}`);
  }
  if (filters.categories && filters.categories.length > 0) {
    const placeholders = filters.categories.map((_, i) => `$${params.length + i + 1}`).join(',');
    conditions.push(`category IN (${placeholders})`);
    params.push(...filters.categories);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit !== undefined ? filters.limit : (filters.page !== undefined ? 30 : 10000);
  const page = filters.page !== undefined ? Math.max(1, filters.page) : 1;
  const offset = (page - 1) * limit;
  const limitClause = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : '';

  const query = `
    SELECT
      id AS book_id,
      title,
      author,
      COALESCE(publisher, 'Unknown Publisher') AS publisher,
      COALESCE(price, 0) AS price,
      COALESCE(stock, 0) AS stock,
      COALESCE(category, 'general') AS category,
      COALESCE(description, '') AS description,
      cover_url,
      COALESCE(popularity_score, 0) AS relevance_score
    FROM books
    ${whereClause}
    ORDER BY COALESCE(popularity_score, 0) DESC, COALESCE(updated_at, NOW()) DESC
    ${limitClause}
  `;

  const books = normalizeBooks((await sql.query<CatalogApiBook>(query, params)).rows);

  const feedbackStats: Record<string, any> = {};
  try {
    const { getFeedbackStatsBatch } = await import('@/lib/feedback/feedback-store');
    const { hasRedisConfig } = await import('@/lib/config/environment');
    if (hasRedisConfig() && books.length > 0) {
      const batchResult = await getFeedbackStatsBatch(books.map((b) => b.book_id));
      for (const [bookId, stats] of batchResult) {
        if (stats) {
          feedbackStats[bookId] = stats;
        }
      }
    }
  } catch (error) {
    console.warn('[catalog-repository] Failed to load feedback stats:', error);
  }

  if (books.length > SIMPLE_RERANK_THRESHOLD) {
    return applySimpleRerank(books, filters, searchTerms, feedbackStats);
  }

  return await rerankCatalogBooks(
    books,
    [filters.query, ...searchTerms].filter(Boolean).join(' '),
    filters.requirement,
    feedbackStats,
  );
}

export async function getBookDetailsFromDatabase(bookId: string): Promise<Book | null> {
  const query = `
    SELECT
      id AS book_id,
      title,
      author,
      COALESCE(publisher, 'Unknown Publisher') AS publisher,
      COALESCE(price, 0) AS price,
      COALESCE(stock, 0) AS stock,
      COALESCE(category, 'general') AS category,
      COALESCE(description, '') AS description,
      cover_url,
      COALESCE(popularity_score, 0) AS relevance_score
    FROM books
    WHERE id = $1
    LIMIT 1
  `;

  const result = await sql.query<CatalogApiBook>(query, [bookId]);
  return result.rows[0] ? mapBook(result.rows[0]) : null;
}

/**
 * Lightweight rerank for large result sets (10K+).
 * Skips expensive per-book scoring; applies field-weighted scoring only.
 */
function applySimpleRerank(
  books: Book[],
  filters: CatalogSearchFilters,
  searchTerms: string[],
  feedbackStats: Record<string, any>,
): Book[] {
  const query = [filters.query, ...searchTerms].filter(Boolean).join(' ').toLowerCase();
  const terms = query ? query.match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}]{2,}/gu) ?? [] : [];
  const stopwords = new Set(['推荐', '书', '书籍', '书单', '适合', '相关', '一些', '一个', '一本', '给我', '来', '看看', '可以', '想要', '希望', '关于', '比较', '家里', '家人', '最好', '请', '帮我', '有哪些', '哪些']);

  const scored = books.map((book) => {
    let score = Math.log1p(Math.max(0, book.relevance_score ?? 0)) * 0.35;
    const title = book.title.toLowerCase();
    const author = book.author.toLowerCase();
    const category = book.category.toLowerCase();
    const haystack = `${title} ${author} ${category}`;

    for (const term of terms) {
      if (stopwords.has(term)) continue;
      if (title.includes(term)) score += 3.5;
      else if (category.includes(term)) score += 2.6;
      else if (author.includes(term)) score += 1.4;
      else if (haystack.includes(term)) score += 0.6;
    }

    const bookId = book.book_id;
    if (feedbackStats?.[bookId]) {
      const s = feedbackStats[bookId];
      score += Math.log1p(Number(s.positiveCount || 0)) * 1.5 - Number(s.negativeCount || 0) * 0.8;
    }

    return { book, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ book, score }) => ({ ...book, relevance_score: score }));
}

const EXPORT_BATCH_SIZE = 500;

/**
 * Stream books matching filters in batches using keyset pagination.
 * Returns an async generator that yields batches, avoiding loading all rows into memory.
 * Uses keyset pagination on id ASC for O(1) per-batch cost.
 */
export async function* streamBooksForExport(
  filters: CatalogSearchFilters,
): AsyncGenerator<Book[], void, undefined> {
  const conditions: string[] = [];
  const baseParams: unknown[] = [];
  let paramIdx = 1;

  const searchTerms = filters.search_terms?.length
    ? filters.search_terms
    : buildCatalogSearchTerms(filters.query ?? '');
  const textSearch = buildCatalogTextSearch(searchTerms, paramIdx);
  if (textSearch.condition) {
    conditions.push(textSearch.condition);
    baseParams.push(...textSearch.params);
    paramIdx += textSearch.params.length;
  }

  if (filters.author) {
    baseParams.push(`%${filters.author}%`);
    conditions.push(`author ILIKE $${paramIdx++}`);
  }
  if (filters.price_min !== undefined) {
    baseParams.push(filters.price_min);
    conditions.push(`price >= $${paramIdx++}`);
  }
  if (filters.price_max !== undefined) {
    baseParams.push(filters.price_max);
    conditions.push(`price <= $${paramIdx++}`);
  }
  if (filters.categories && filters.categories.length > 0) {
    const placeholders = filters.categories.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`category IN (${placeholders})`);
    baseParams.push(...filters.categories);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 10000;
  let lastId: bigint | number = 0;
  let totalFetched = 0;

  while (totalFetched < limit) {
    const batchSize = Math.min(EXPORT_BATCH_SIZE, limit - totalFetched);
    const params = [...baseParams, lastId, batchSize];

    const query = `
      SELECT
        id AS book_id,
        title,
        author,
        COALESCE(publisher, 'Unknown Publisher') AS publisher,
        COALESCE(price, 0) AS price,
        COALESCE(stock, 0) AS stock,
        COALESCE(category, 'general') AS category,
        COALESCE(description, '') AS description,
        cover_url,
        COALESCE(popularity_score, 0) AS relevance_score
      FROM books
      ${whereClause}
        ${conditions.length > 0 ? 'AND' : 'WHERE'} id > $${paramIdx}
      ORDER BY id ASC
      LIMIT $${paramIdx + 1}
    `;

    const result = await sql.query<CatalogApiBook>(query, params);
    const batch = normalizeBooks(result.rows);

    if (batch.length === 0) break;

    yield batch;
    totalFetched += batch.length;
    lastId = batch[batch.length - 1].book_id as unknown as bigint;
  }
}

export async function getPopularBooksFromDatabase(count: number): Promise<Book[]> {
  const query = `
    SELECT
      id AS book_id,
      title,
      author,
      COALESCE(publisher, 'Unknown Publisher') AS publisher,
      COALESCE(price, 0) AS price,
      COALESCE(stock, 0) AS stock,
      COALESCE(category, 'general') AS category,
      COALESCE(description, '') AS description,
      cover_url,
      COALESCE(popularity_score, 0) AS relevance_score
    FROM books
    ORDER BY
      COALESCE(popularity_score, 0) DESC,
      COALESCE(updated_at, NOW()) DESC
    LIMIT $1
  `;

  const result = await sql.query<CatalogApiBook>(query, [count]);
  return normalizeBooks(result.rows);
}
