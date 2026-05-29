/**
 * pgvector 向量搜索模块
 * 使用 PostgreSQL + pgvector 实现单库向量搜索
 * 替代 Upstash Vector，减少外部依赖
 */

import { sql } from '@vercel/postgres';
import type { Book, VectorBookMetadata, ChunkMetadata } from '@/lib/types/rag';
import { VECTOR_DIMENSION } from '@/lib/vector-service';

const DEFAULT_SIMILARITY = 0;

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorBookMetadata;
}

export interface ChunkSearchResult {
  id: string;
  score: number;
  metadata: ChunkMetadata;
}

function isValidVector(vector: number[]): boolean {
  return Array.isArray(vector) && vector.length === VECTOR_DIMENSION;
}

function formatVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

function mapRowToBook(row: Record<string, unknown>): Book {
  return {
    book_id: String(row.id),
    title: (row.title as string) || 'Unknown Title',
    author: (row.author as string) || 'Unknown Author',
    publisher: (row.publisher as string) || '',
    description: (row.description as string) || '',
    cover_url: (row.cover_url as string) || '',
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
    category: (row.category as string) || 'general',
    relevance_score: Number(row.similarity ?? DEFAULT_SIMILARITY),
    popularity_score: Number(row.popularity_score ?? 0),
  };
}

function mapRowToVectorSearchResult(row: Record<string, unknown>): VectorSearchResult {
  return {
    id: String(row.book_id),
    score: Number(row.similarity ?? DEFAULT_SIMILARITY),
    metadata: {
      bookId: String(row.book_id),
      title: (row.title as string) || 'Unknown Title',
      author: (row.author as string) || 'Unknown Author',
      category: (row.category as string) || 'general',
      description: (row.description as string) || '',
    },
  };
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
    WHERE be.embedding IS NOT NULL AND be.chunk_index = 0
    ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
    LIMIT ${topK}
  `;

  return results.rows.map(mapRowToVectorSearchResult);
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

  let results;

  if (filter?.bookId) {
    results = await sql`
      SELECT
        be.id,
        be.book_id,
        be.chunk_index,
        be.text_content,
        1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
      FROM book_embeddings be
      WHERE be.embedding IS NOT NULL
        AND be.chunk_index > 0
        AND be.book_id = ${filter.bookId}::bigint
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  } else if (filter?.category) {
    results = await sql`
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
        AND be.chunk_index > 0
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  } else {
    results = await sql`
      SELECT
        be.id,
        be.book_id,
        be.chunk_index,
        be.text_content,
        1 - (be.embedding <=> ${formatVector(queryVector)}::vector) AS similarity
      FROM book_embeddings be
      WHERE be.embedding IS NOT NULL
        AND be.chunk_index > 0
      ORDER BY be.embedding <=> ${formatVector(queryVector)}::vector
      LIMIT ${topK}
    `;
  }

  return results.rows.map((row) => ({
    id: String(row.id),
    score: Number(row.similarity ?? DEFAULT_SIMILARITY),
    metadata: {
      bookId: String(row.book_id),
      chunkIndex: row.chunk_index as number,
      text: (row.text_content as string) || '',
    },
  }));
}

export async function vectorSearchBooksDirect(
  queryVector: number[],
  topK: number = 10,
  options?: {
    categories?: string[];
    maxPrice?: number;
    queryText?: string;
  },
): Promise<Book[]> {
  if (!isValidVector(queryVector)) {
    throw new Error(`Invalid vector dimension: expected ${VECTOR_DIMENSION}, got ${queryVector.length}`);
  }

  const { categories, maxPrice, queryText } = options || {};

  // 构建 WHERE 条件
  const conditions: string[] = ['be.embedding IS NOT NULL', 'be.chunk_index = 0'];
  const params: unknown[] = [];

  if (categories && categories.length > 0) {
    const placeholders = categories.map((_, i) => `$${params.length + i + 1}`).join(',');
    conditions.push(`b.category IN (${placeholders})`);
    params.push(...categories);
  }

  if (maxPrice !== undefined) {
    params.push(maxPrice);
    conditions.push(`b.price <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 使用更大的查询范围，然后取 topK，确保有足够的符合条件的结果
  const queryTopK = Math.max(topK * 3, 50);

  // 构建查询
  const results = await sql.query(`
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
      1 - (be.embedding <=> $1::vector) AS similarity
    FROM book_embeddings be
    JOIN books b ON be.book_id = b.id
    ${whereClause}
    ORDER BY be.embedding <=> $1::vector
    LIMIT $2
  `, [formatVector(queryVector), queryTopK, ...params]);

  let books = results.rows.map(mapRowToBook);

  // 如果有查询文本，尝试做简单的关键词匹配增强排序
  if (queryText && queryText.trim()) {
    const keywords = queryText.toLowerCase().split(/\s+/).filter(Boolean);
    
    books = books.map(book => {
      let keywordScore = 0;
      const searchText = `${book.title} ${book.author} ${book.category} ${book.description}`.toLowerCase();
      
      keywords.forEach(keyword => {
        if (searchText.includes(keyword)) {
          keywordScore += 1;
        }
      });
      
      // 将关键词匹配分数和相似度分数结合
      const combinedScore = book.relevance_score + keywordScore * 0.3;
      
      return {
        ...book,
        relevance_score: combinedScore
      };
    });
    
    // 重新排序
    books.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  // 去重（同一本书可能有多个 chunk）
  const seen = new Set();
  const uniqueBooks: Book[] = [];
  
  for (const book of books) {
    if (!seen.has(book.book_id)) {
      seen.add(book.book_id);
      uniqueBooks.push(book);
    }
    if (uniqueBooks.length >= topK) break;
  }

  return uniqueBooks;
}

export async function deleteBookVector(bookId: string): Promise<void> {
  await sql`DELETE FROM book_embeddings WHERE book_id = ${bookId}::bigint`;
}

export async function deleteChunkVectorsByBookIds(bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;

  await sql.query(
    `DELETE FROM book_embeddings WHERE book_id = ANY($1::bigint[])`,
    [bookIds.map(id => String(id))]
  );
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
