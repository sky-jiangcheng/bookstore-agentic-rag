import 'server-only';

import { sql } from '@vercel/postgres';

import config, { hasCatalogServiceConfig, hasVectorConfig } from '@/lib/config/environment';
import { buildCatalogSearchQuery, buildCatalogSearchTerms, rerankCatalogBooks } from '@/lib/search/query-rerank.js';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';
import { buildEmbeddingPair } from '@/lib/local-vector.js';
import { vectorSearch } from '@/lib/upstash';
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout';

const CATALOG_SERVICE_TIMEOUT_MS = 8000;

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

export async function fetchBooksByIds(ids: string[]): Promise<Book[]> {
  if (ids.length === 0) {
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
      WHERE id::text = ANY($1::text[])
    `,
    [ids]
  );

  const byId = new Map(result.rows.map((row) => [String(row.book_id ?? row.id), mapBook(row)]));
  return ids.map((id) => byId.get(String(id))).filter((book): book is Book => Boolean(book));
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

export async function searchCatalogFromDatabase(filters: CatalogSearchFilters): Promise<Book[]> {
  const searchTerms = filters.query ? buildCatalogSearchTerms(filters.query) : [];
  const searchQuery = filters.query ? buildCatalogSearchQuery(filters.query) : '';
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
    ORDER BY
      COALESCE(popularity_score, 0) DESC,
      COALESCE(updated_at, NOW()) DESC
    LIMIT 50
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

  // Vector search: only attempt if Upstash Vector is configured
  if (filters.query && hasVectorConfig()) {
    const { vector, sparseVector } = buildEmbeddingPair(searchQuery || filters.query);
    const vectorResults = await vectorSearch(vector, 50, sparseVector);
    const ids = vectorResults.map((entry) => String(entry.metadata?.bookId ?? entry.id));
    const books = await fetchBooksByIds(ids);
    const bookById = new Map(books.map((book) => [book.book_id, book]));

    const vectorBooks = ids
    .map((id) => bookById.get(id))
    .filter((book): book is Book => Boolean(book))
    .map((book) => ({
      ...book,
      relevance_score:
        Number(vectorResults.find((entry) => String(entry.metadata?.bookId ?? entry.id) === book.book_id)?.score ?? book.relevance_score ?? 0),
    }));

    return rerankCatalogBooks(mergeBooksById(sqlBooks, vectorBooks), searchQuery || filters.query || '');
  }

  return sqlBooks;
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
  const payload = await fetchFromCatalogService<{ book?: CatalogApiBook }>(`/api/rag/books/${bookId}`);
  return payload.book ? mapBook(payload.book) : null;
}

export async function getPopularBooksFromService(count: number): Promise<Book[]> {
  const payload = await fetchFromCatalogService<{ books?: CatalogApiBook[]; items?: CatalogApiBook[] }>(
    `/api/rag/books/popular?count=${count}`
  );

  return normalizeBooks(payload.books ?? payload.items ?? []);
}
