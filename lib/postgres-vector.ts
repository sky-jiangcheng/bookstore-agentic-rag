/**
 * pgvector 向量搜索模块
 * 使用 PostgreSQL + pgvector 实现单库向量搜索
 * 替代 Upstash Vector，减少外部依赖
 */

import { sql } from '@vercel/postgres';
import type { Book } from '@/lib/types/rag';

export interface VectorBookMetadata {
  bookId: string;
  title: string;
  author: string;
  category: string;
  description?: string;
  sourceId?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorBookMetadata;
}

export interface ChunkMetadata {
  bookId: string;
  chunkIndex: number;
  text: string;
  title?: string;
  author?: string;
  category?: string;
}

export interface ChunkSearchResult {
  id: string;
  score: number;
  metadata: ChunkMetadata;
}

const VECTOR_DIMENSION = 768;

function isValidVector(vector: number[]): boolean {
  return Array.isArray(vector) && vector.length === VECTOR_DIMENSION;
}

function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

export async function upsertBookVector(
  bookId: string,
  vector: number[],
  _metadata: VectorBookMetadata,
  textContent?: string,
): Promise<void> {
  if (!isValidVector(vector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${vector.length}`);
  }

  await sql`
    INSERT INTO book_embeddings (book_id, chunk_index, text_content, embedding)
    VALUES (
      ${bookId}::bigint,
      0,
      ${textContent || null},
      ${formatVector(vector)}::vector
    )
    ON CONFLICT (book_id, chunk_index)
    DO UPDATE SET
      text_content = EXCLUDED.text_content,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
  `;
}

export async function vectorSearchBooks(
  queryVector: number[],
  topK: number = 10,
): Promise<VectorSearchResult[]> {
  if (!isValidVector(queryVector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${queryVector.length}`);
  }

  const results = await sql`
    SELECT
      be.book_id,
      b.title,
      b.author,
      b.category,
      b.description,
      b.publisher,
      b.price,
      b.stock,
      b.cover_url,
      b.popularity_score,
      1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
    FROM book_embeddings be
    JOIN books b ON be.book_id = b.id
    WHERE be.embedding IS NOT NULL
    ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
    LIMIT ${topK}
  `;

  return results.rows.map((row) => ({
    id: String(row.book_id),
    score: Number(row.similarity),
    metadata: {
      bookId: String(row.book_id),
      title: row.title,
      author: row.author || 'Unknown Author',
      category: row.category || 'general',
      description: row.description || '',
    },
  }));
}

/**
 * 直接搜索书籍向量并返回完整 Book 对象（避免二次查询）
 */
export async function vectorSearchBooksDirect(
  queryVector: number[],
  topK: number = 10,
): Promise<Book[]> {
  if (!isValidVector(queryVector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${queryVector.length}`);
  }

  const results = await sql`
    SELECT
      b.id,
      b.title,
      b.author,
      b.publisher,
      b.description,
      b.cover_url,
      b.price,
      b.stock,
      b.category,
      b.popularity_score,
      1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
    FROM book_embeddings be
    JOIN books b ON be.book_id = b.id
    WHERE be.embedding IS NOT NULL
    ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
    LIMIT ${topK}
  `;

  return results.rows.map((row) => ({
    book_id: String(row.id),
    title: row.title,
    author: row.author || 'Unknown Author',
    publisher: row.publisher || '',
    description: row.description || '',
    cover_url: row.cover_url || '',
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    category: row.category || 'general',
    relevance_score: Number(row.similarity || 0),
  }));
}

export async function upsertChunkVector(
  bookId: string,
  chunkIndex: number,
  vector: number[],
  metadata: ChunkMetadata,
): Promise<void> {
  if (!isValidVector(vector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${vector.length}`);
  }

  const textContent = metadata.text || [metadata.title, metadata.author, metadata.category]
    .filter(Boolean)
    .join('\n');

  await sql`
    INSERT INTO book_embeddings (book_id, chunk_index, text_content, embedding)
    VALUES (
      ${bookId}::bigint,
      ${chunkIndex},
      ${textContent},
      ${formatVector(vector)}::vector
    )
    ON CONFLICT (book_id, chunk_index)
    DO UPDATE SET
      text_content = EXCLUDED.text_content,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
  `;
}

export async function vectorSearchChunks(
  queryVector: number[],
  topK: number = 10,
  filter?: { bookId?: string; category?: string },
): Promise<ChunkSearchResult[]> {
  if (!isValidVector(queryVector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${queryVector.length}`);
  }

  let query;

  if (filter?.bookId) {
    query = sql`
      SELECT
        be.id,
        be.book_id,
        be.chunk_index,
        be.text_content,
        1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
      FROM book_embeddings be
      WHERE be.embedding IS NOT NULL
      AND be.book_id = ${filter.bookId}::bigint
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  } else if (filter?.category) {
    query = sql`
      SELECT
        be.id,
        be.book_id,
        be.chunk_index,
        be.text_content,
        1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
      FROM book_embeddings be
      JOIN books b ON be.book_id = b.id
      WHERE be.embedding IS NOT NULL
      AND b.category = ${filter.category}
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  } else {
    query = sql`
      SELECT
        be.id,
        be.book_id,
        be.chunk_index,
        be.text_content,
        1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
      FROM book_embeddings be
      WHERE be.embedding IS NOT NULL
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  }

  const results = await query;

  return results.rows.map((row) => ({
    id: String(row.id),
    score: Number(row.similarity),
    metadata: {
      bookId: String(row.book_id),
      chunkIndex: row.chunk_index,
      text: row.text_content || '',
    },
  }));
}

export async function deleteBookVector(bookId: string): Promise<void> {
  await sql`DELETE FROM book_embeddings WHERE book_id = ${bookId}::bigint`;
}

export async function deleteChunkVectorsByBookIds(bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;

  for (const bookId of bookIds) {
    await sql`DELETE FROM book_embeddings WHERE book_id = ${bookId}::bigint`;
  }
}

export async function getBookEmbeddingCount(): Promise<number> {
  const result = await sql`SELECT COUNT(*) as count FROM book_embeddings`;
  return Number(result.rows[0]?.count || 0);
}

export async function hasPgVectorSupport(): Promise<boolean> {
  try {
    const result = await sql`SELECT 1 as supported FROM pg_extension WHERE extname = 'vector'`;
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
