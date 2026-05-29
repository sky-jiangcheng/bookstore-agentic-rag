import 'server-only';

import { sql } from '@vercel/postgres';

import { buildCatalogSearchQuery, rerankCatalogBooks } from '@/lib/search/query-rerank';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';
import { buildEmbeddingPair } from '@/lib/local-vector';
import { vectorSearch } from '@/lib/vector-service';
import { AsyncTimeoutError, withTimeout } from '@/lib/utils/async-timeout';

const VECTOR_SEARCH_TIMEOUT_MS = 2500;
const MAX_RESULTS = 50;

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

export async function fetchBooksByIds(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) {
    return [];
  }

  const numericIds = ids.map((id) => Number(id)).filter((n) => !isNaN(n));
  if (numericIds.length === 0) {
    return [];
  }

  const result = await sql.query<CatalogApiBook>(
    `
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
      WHERE id = ANY($1::bigint[])
    `,
    [numericIds]
  );

  const byId = new Map(result.rows.map((row) => [String(row.book_id ?? row.id), mapBook(row)]));
  return ids.map((id) => byId.get(String(id))).filter((book): book is Book => Boolean(book));
}

/**
 * 对 books 按非语义过滤器做 JS 端过滤：author(包含)、price_min、price_max、categories
 */
function applyFilters(books: Book[], filters: CatalogSearchFilters): Book[] {
  let filtered = books;

  if (filters.author) {
    const authorLower = filters.author.toLowerCase();
    filtered = filtered.filter((b) => b.author.toLowerCase().includes(authorLower));
  }
  if (filters.price_min !== undefined) {
    filtered = filtered.filter((b) => b.price >= filters.price_min!);
  }
  if (filters.price_max !== undefined) {
    filtered = filtered.filter((b) => b.price <= filters.price_max!);
  }
  if (filters.categories && filters.categories.length > 0) {
    const catSet = new Set(filters.categories);
    filtered = filtered.filter((b) => catSet.has(b.category));
  }

  return filtered;
}

/**
 * 无文本查询时的浏览/筛选模式 → 简单 SQL（无 ILIKE 交叉乘积）
 */
async function searchCatalogByFilters(filters: CatalogSearchFilters): Promise<Book[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (filters.author) {
    paramIdx++;
    conditions.push(`author ILIKE '%' || $${paramIdx} || '%'`);
    params.push(filters.author);
  }
  if (filters.price_min !== undefined) {
    paramIdx++;
    conditions.push(`price >= $${paramIdx}`);
    params.push(filters.price_min);
  }
  if (filters.price_max !== undefined) {
    paramIdx++;
    conditions.push(`price <= $${paramIdx}`);
    params.push(filters.price_max);
  }
  if (filters.categories && filters.categories.length > 0) {
    const placeholders = filters.categories.map((_, i) => `$${paramIdx + i + 1}`).join(',');
    conditions.push(`category IN (${placeholders})`);
    params.push(...filters.categories);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
    LIMIT ${MAX_RESULTS}
  `;

  const result = await sql.query<CatalogApiBook>(query, params);
  return normalizeBooks(result.rows);
}

/**
 * 搜索目录：有 query 时走 pgvector 语义搜索，无 query 时走简单筛选 SQL。
 */
export async function searchCatalogFromDatabase(filters: CatalogSearchFilters): Promise<Book[]> {
  // ── 无文本查询 → 浏览/筛选模式 ──
  if (!filters.query) {
    return searchCatalogByFilters(filters);
  }

  // ── 有文本查询 → pgvector 语义搜索管线 ──
  const searchQuery = buildCatalogSearchQuery(filters.query);
  const queryText = searchQuery || filters.query;
  const { vector } = buildEmbeddingPair(queryText);

  let books: Book[];
  try {
    // Step 1: 向量相似度搜索（HNSW 索引，亚毫秒级）
    const vectorResults = await withTimeout(
      vectorSearch(vector, MAX_RESULTS),
      VECTOR_SEARCH_TIMEOUT_MS,
      'catalog vector search',
    );

    // Step 2: 按 ID 获取完整书籍记录
    const ids = vectorResults.map((entry) => String(entry.metadata?.bookId ?? entry.id));
    books = await fetchBooksByIds(ids);

    // Step 3: 注入向量搜索的 relevance_score
    const scoreMap = new Map(
      vectorResults.map((entry) => [String(entry.metadata?.bookId ?? entry.id), entry.score]),
    );
    books = books.map((b) => ({
      ...b,
      relevance_score: Math.max(scoreMap.get(b.book_id) ?? b.relevance_score, b.relevance_score),
    }));
  } catch (error) {
    if (error instanceof AsyncTimeoutError) {
      console.warn('[catalog/search] Vector search timed out; returning filter-only results');
      return searchCatalogByFilters(filters);
    }
    throw error;
  }

  // Step 4: JS 端应用非语义过滤器（author、price 范围、categories）
  books = applyFilters(books, filters);

  // Step 5: rerank 提升精度（纯 JS，无外部依赖）
  return rerankCatalogBooks(books, queryText);
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

export async function searchCatalogFromService(filters: CatalogSearchFilters): Promise<Book[]> {
  const payload = await fetchFromCatalogService<{ books?: CatalogApiBook[]; items?: CatalogApiBook[] }>(
    '/api/rag/books/search',
    {
      method: 'POST',
      body: JSON.stringify(filters),
    }
  );

  const searchQuery = filters.query ? buildCatalogSearchQuery(filters.query) : '';
  return rerankCatalogBooks(
    normalizeBooks(payload.books ?? payload.items ?? []),
    searchQuery || (filters.query ?? '')
  );
}

export async function getBookDetailsFromService(bookId: string): Promise<Book | null> {
  const payload = await fetchFromCatalogService<{ book?: CatalogApiBook }>(`/api/rag/books/${encodeURIComponent(bookId)}`);
  return payload.book ? mapBook(payload.book) : null;
}

export async function getPopularBooksFromService(count: number): Promise<Book[]> {
  const payload = await fetchFromCatalogService<{ books?: CatalogApiBook[]; items?: CatalogApiBook[] }>(
    `/api/rag/books/popular?count=${count}`
  );

  return normalizeBooks(payload.books ?? payload.items ?? []);
}
