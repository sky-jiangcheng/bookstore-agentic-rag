/**
 * 目录仓储层
 * 负责从数据库和外部目录服务获取书籍数据
 */
import 'server-only';

import { sql } from '@vercel/postgres';

import config, { hasCatalogServiceConfig, hasVectorConfig } from '@/lib/config/environment';
import { buildCatalogSearchQuery, buildCatalogSearchTerms, rerankCatalogBooks } from '@/lib/search/query-rerank';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';
import { buildEmbeddingPair } from '@/lib/local-vector';
import { vectorSearch } from '@/lib/vector-service';
import { AsyncTimeoutError, withTimeout } from '@/lib/utils/async-timeout';
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout';

const CATALOG_SERVICE_TIMEOUT_MS = 8000;
const VECTOR_SEARCH_TIMEOUT_MS = 2500;
const MAX_BOOKS_PER_QUERY = 100;
const DEFAULT_QUERY_LIMIT = 50;

const BOOK_SELECT_FIELDS = `
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
` as const;

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

function validateBookId(bookId: string): boolean {
  return Boolean(bookId && bookId.trim().length > 0);
}

function validateSearchTerms(terms: string[]): string[] {
  return terms
    .filter((term) => Boolean(term && term.trim().length > 0))
    .map((term) => term.trim());
}

function validateCount(count: number, max: number = MAX_BOOKS_PER_QUERY): number {
  const validCount = Math.max(1, Math.min(count, max));
  return validCount;
}

function parseNumeric(value: unknown, defaultValue: number): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseString(value: unknown, defaultValue: string): string {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

function mapBook(record: CatalogApiBook): Book {
  const bookId = record.book_id ?? record.id;
  if (!bookId) {
    throw new Error('Catalog record is missing book_id');
  }

  return {
    book_id: String(bookId),
    title: parseString(record.title, 'Unknown Title'),
    author: parseString(record.author, 'Unknown Author'),
    publisher: parseString(record.publisher, 'Unknown Publisher'),
    price: parseNumeric(record.price, 0),
    stock: parseNumeric(record.stock, 0),
    category: parseString(record.category, 'general'),
    description: parseString(record.description, ''),
    cover_url: record.cover_url ?? undefined,
    relevance_score: parseNumeric(record.relevance_score, 0),
  };
}

function normalizeBooks(records: CatalogApiBook[]): Book[] {
  return records.map(mapBook);
}

function mergeBooksById(primary: Book[], secondary: Book[]): Book[] {
  const merged = new Map<string, Book>();

  for (const book of primary) {
    merged.set(book.book_id, book);
  }

  for (const book of secondary) {
    const existing = merged.get(book.book_id);
    if (!existing) {
      merged.set(book.book_id, book);
      continue;
    }

    merged.set(book.book_id, {
      ...existing,
      relevance_score: Math.max(existing.relevance_score ?? 0, book.relevance_score ?? 0),
      description: existing.description || book.description,
      cover_url: existing.cover_url || book.cover_url,
    });
  }

  return Array.from(merged.values());
}

async function fetchFromCatalogService<T>(path: string, init?: RequestInit): Promise<T> {
  if (!hasCatalogServiceConfig()) {
    throw new Error('Catalog service is not configured');
  }

  const response = await fetchWithTimeout(
    `${config.services.catalogUrl}${path}`,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    },
    CATALOG_SERVICE_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Catalog service request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchBooksByIds(ids: string[]): Promise<Book[]> {
  const validIds = ids.filter(validateBookId);
  if (validIds.length === 0) {
    return [];
  }

  const query = `
    SELECT ${BOOK_SELECT_FIELDS}
    FROM books
    WHERE id::text = ANY($1::text[])
  `;

  const result = await sql.query<CatalogApiBook>(query, [validIds]);
  const byId = new Map(result.rows.map((row) => [String(row.book_id ?? row.id), mapBook(row)]));
  return validIds.map((id) => byId.get(String(id))).filter((book): book is Book => Boolean(book));
}

export async function searchCatalogFromService(filters: CatalogSearchFilters): Promise<Book[]> {
  const response = await fetchFromCatalogService<{ books: CatalogApiBook[] }>('/books/search', {
    method: 'POST',
    body: JSON.stringify(filters),
  });
  return normalizeBooks(response.books);
}

export async function getBookDetailsFromService(bookId: string): Promise<Book | null> {
  if (!validateBookId(bookId)) {
    return null;
  }

  try {
    const response = await fetchFromCatalogService<{ book: CatalogApiBook }>(`/books/${bookId}`);
    return mapBook(response.book);
  } catch {
    return null;
  }
}

export async function getPopularBooksFromService(count: number): Promise<Book[]> {
  const validCount = validateCount(count);
  const response = await fetchFromCatalogService<{ books: CatalogApiBook[] }>('/books/popular', {
    method: 'POST',
    body: JSON.stringify({ count: validCount }),
  });
  return normalizeBooks(response.books);
}

export async function searchCatalogFromDatabase(filters: CatalogSearchFilters): Promise<Book[]> {
  const rawTerms = filters.query ? buildCatalogSearchTerms(filters.query) : [];
  const searchTerms = validateSearchTerms(rawTerms);
  const searchQuery = filters.query ? buildCatalogSearchQuery(filters.query) : '';

  const query = `
    WITH ranked_books AS (
      SELECT
        ${BOOK_SELECT_FIELDS.replace('relevance_score', 'popularity_score AS relevance_score, COALESCE(updated_at, NOW()) AS updated_at')}
        ${`
        , COALESCE((
            SELECT SUM(
              CASE WHEN title ILIKE '%' || term || '%' THEN 6 ELSE 0 END
              + CASE WHEN category ILIKE '%' || term || '%' THEN 5 ELSE 0 END
              + CASE WHEN author ILIKE '%' || term || '%' THEN 1 ELSE 0 END
            )
            FROM unnest(COALESCE($1::text[], ARRAY[]::text[])) AS term
            WHERE term <> ''
          ), 0) AS search_rank
        `}
      FROM books
      WHERE
        (
          $1::text[] IS NULL
          OR cardinality($1::text[]) = 0
          OR EXISTS (
            SELECT 1
            FROM unnest($1::text[]) AS term
            WHERE term <> ''
              AND (
                title ILIKE '%' || term || '%'
                OR author ILIKE '%' || term || '%'
                OR category ILIKE '%' || term || '%'
              )
          )
        )
        AND ($2::text IS NULL OR author ILIKE '%' || $2 || '%')
        AND ($3::numeric IS NULL OR price >= $3)
        AND ($4::numeric IS NULL OR price <= $4)
        AND (
          $5::text[] IS NULL OR cardinality($5::text[]) = 0 OR category = ANY($5::text[])
        )
    )
    SELECT
      book_id,
      title,
      author,
      publisher,
      price,
      stock,
      category,
      description,
      cover_url,
      CASE
        WHEN COALESCE(cardinality($1::text[]), 0) > 0 THEN search_rank
        ELSE relevance_score
      END AS relevance_score
    FROM ranked_books
    ORDER BY
      CASE
        WHEN COALESCE(cardinality($1::text[]), 0) > 0 THEN search_rank
        ELSE relevance_score
      END DESC,
      popularity_score DESC,
      updated_at DESC
    LIMIT ${DEFAULT_QUERY_LIMIT}
  `;

  const result = await sql.query<CatalogApiBook>(query, [
    searchTerms.length > 0 ? searchTerms : null,
    filters.author ?? null,
    filters.price_min ?? null,
    filters.price_max ?? null,
    filters.categories && filters.categories.length > 0 ? filters.categories : null,
  ]);

  const sqlBooks = normalizeBooks(result.rows);

  if (!filters.query) {
    return sqlBooks;
  }

  const rerankedSql = rerankCatalogBooks(sqlBooks, searchQuery || filters.query);

  if (filters.query && hasVectorConfig() && !config.vercel.enabled) {
    try {
      const { vector, sparseVector } = buildEmbeddingPair(searchQuery || filters.query);
      const vectorResults = await withTimeout(
        vectorSearch(vector, DEFAULT_QUERY_LIMIT, sparseVector),
        VECTOR_SEARCH_TIMEOUT_MS,
        'catalog vector search',
      );
      const ids = vectorResults.map((entry) => String(entry.metadata?.bookId ?? entry.id));
      const books = await fetchBooksByIds(ids);
      const bookById = new Map(books.map((book) => [book.book_id, book]));

      const vectorBooks = ids
        .map((id) => bookById.get(id))
        .filter((book): book is Book => Boolean(book))
        .map((book) => ({
          ...book,
          relevance_score: Number(
            vectorResults.find((entry) => String(entry.metadata?.bookId ?? entry.id) === book.book_id)
              ?.score ?? book.relevance_score ?? 0
          ),
        }));

      return rerankCatalogBooks(mergeBooksById(rerankedSql, vectorBooks), searchQuery || filters.query || '');
    } catch (error) {
      if (error instanceof AsyncTimeoutError) {
        console.warn('[catalog/search] Vector enrichment timed out; returning cleaned SQL results only');
        return rerankedSql;
      }
      throw error;
    }
  }

  return rerankedSql;
}

export async function getBookDetailsFromDatabase(bookId: string): Promise<Book | null> {
  if (!validateBookId(bookId)) {
    return null;
  }

  const query = `
    SELECT ${BOOK_SELECT_FIELDS}
    FROM books
    WHERE id = $1
    LIMIT 1
  `;

  const result = await sql.query<CatalogApiBook>(query, [bookId]);
  return result.rows[0] ? mapBook(result.rows[0]) : null;
}

export async function getPopularBooksFromDatabase(count: number): Promise<Book[]> {
  const validCount = validateCount(count);

  const query = `
    SELECT ${BOOK_SELECT_FIELDS}
    FROM books
    ORDER BY
      relevance_score DESC,
      updated_at DESC
    LIMIT $1
  `;

  const result = await sql.query<CatalogApiBook>(query, [validCount]);
  return normalizeBooks(result.rows);
}
