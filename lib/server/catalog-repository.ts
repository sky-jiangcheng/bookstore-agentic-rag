import 'server-only';

import { sql } from '@vercel/postgres';

import { buildCatalogSearchQuery, rerankCatalogBooks } from '@/lib/search/query-rerank';
import type { Book, CatalogSearchFilters } from '@/lib/types/rag';

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
 * 搜索目录：关键词 ILIKE 搜索 + 筛选。
 * query 来自用户自由文本，无 query 时仅按筛选条件返回热门图书。
 */
export async function searchCatalogFromDatabase(filters: CatalogSearchFilters): Promise<Book[]> {
  const searchQuery = filters.query ? buildCatalogSearchQuery(filters.query) : '';
  const queryText = searchQuery || filters.query || '';

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Text search across title, author, category
  if (queryText) {
    const searchTerms = queryText.split(/\s+/).filter(Boolean);
    if (searchTerms.length > 0) {
      const textConditions = searchTerms.map((_, i) => {
        const p = `$${params.length + 1}`;
        params.push(`%${searchTerms[i]}%`);
        return `(title ILIKE ${p} OR author ILIKE ${p} OR category ILIKE ${p})`;
      });
      conditions.push(`(${textConditions.join(' AND ')})`);
    }
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

  const books = normalizeBooks((await sql.query<CatalogApiBook>(query, params)).rows);
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
