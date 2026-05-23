/**
 * 向量服务适配层
 * 支持 pgvector (PostgreSQL) 和 Upstash Vector 两种后端
 * 默认使用 pgvector 单库架构，需要时可切换到 Upstash Vector
 */

import {
  vectorSearchBooks as pgVectorSearchBooks,
  vectorSearchBooksDirect as pgVectorSearchBooksDirect,
  upsertBookVector as pgUpsertBookVector,
  upsertChunkVector as pgUpsertChunkVector,
  vectorSearchChunks as pgVectorSearchChunks,
  deleteBookVector as pgDeleteBookVector,
  deleteChunkVectorsByBookIds as pgDeleteChunkVectorsByBookIds,
  getBookEmbeddingCount as pgGetBookEmbeddingCount,
  hasPgVectorSupport as pgHasPgVectorSupport,
  type VectorBookMetadata,
  type ChunkMetadata,
  type VectorSearchResult,
  type ChunkSearchResult,
} from './postgres-vector';
import type { Book } from '@/lib/types/rag';

import { Index } from '@upstash/vector';
import { config, hasVectorConfig } from '@/lib/config/environment';
import { buildBookDocument, buildSparseVector } from './local-vector';

export type { VectorBookMetadata, ChunkMetadata };

const VECTOR_DIMENSION = 768;

const upstashIndex = hasVectorConfig()
  ? new Index({
      url: config.upstash.vectorUrl,
      token: config.upstash.vectorToken,
    })
  : null;

type VectorBackend = 'pgvector' | 'upstash';

function getVectorBackend(): VectorBackend {
  return upstashIndex ? 'upstash' : 'pgvector';
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface VectorStoreInfo {
  backend: VectorBackend;
  vectorCount: number;
  dimension: number;
  supported: boolean;
}

export async function upsertBookVector(
  bookId: string,
  vector: number[],
  metadata: VectorBookMetadata,
  sparseVector?: SparseVector,
): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    await upstashUpsertBookVector(bookId, vector, metadata, sparseVector);
  } else {
    await pgUpsertBookVector(bookId, vector, metadata);
  }
}

async function upstashUpsertBookVector(
  bookId: string,
  vector: number[],
  metadata: VectorBookMetadata,
  sparseVector?: SparseVector,
): Promise<void> {
  if (!upstashIndex) {
    throw new Error('Upstash Vector is not configured');
  }

  const document = buildBookDocument(metadata);
  const metadataRecord: Record<string, unknown> = {
    bookId: metadata.bookId,
    title: metadata.title,
    author: metadata.author,
    category: metadata.category,
    description: metadata.description || '',
  };

  if (metadata.sourceId) {
    metadataRecord.sourceId = metadata.sourceId;
  }

  await upstashIndex.upsert([
    {
      id: bookId.toString(),
      vector,
      sparseVector: sparseVector ?? buildSparseVector(document),
      metadata: metadataRecord,
    },
  ]);
}

export async function vectorSearch(
  queryVector: number[],
  topK: number = 10,
  sparseVector?: SparseVector,
): Promise<VectorSearchResult[]> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    return upstashVectorSearch(queryVector, topK, sparseVector);
  } else {
    return pgVectorSearchBooks(queryVector, topK);
  }
}

/**
 * 直接搜索书籍向量并返回完整 Book 对象（避免二次查询）
 * 可选支持分类和价格预算约束
 */
export async function vectorSearchDirect(
  queryVector: number[],
  topK: number = 10,
  sparseVector?: SparseVector,
  options?: {
    categories?: string[];
    maxPrice?: number;
    queryText?: string;
  },
): Promise<Book[]> {
  const backend = getVectorBackend();

  if (backend === 'pgvector') {
    return pgVectorSearchBooksDirect(queryVector, topK, options);
  } else {
    // 对于 Upstash，需要先搜索再获取详情，然后在内存中过滤
    const results = await upstashVectorSearch(queryVector, topK, sparseVector);
    const bookIds = results.map(r => r.metadata.bookId).filter(Boolean) as string[];
    const { getBookDetailsBatch } = await import('@/lib/clients/catalog-client');
    const books = await getBookDetailsBatch(bookIds);
    
    // 更新 relevance_score
    const scoreMap = new Map<string, number>();
    for (const result of results) {
      if (result.metadata.bookId) {
        scoreMap.set(result.metadata.bookId, result.score);
      }
    }
    
    let filteredBooks = books.map(book => {
      const score = scoreMap.get(book.book_id);
      if (score !== undefined && score > book.relevance_score) {
        book.relevance_score = score;
      }
      return book;
    });
    
    // 应用约束过滤（对于 Upstash，在内存中进行）
    if (options?.categories && options.categories.length > 0) {
      filteredBooks = filteredBooks.filter(book => 
        options.categories!.includes(book.category)
      );
    }
    if (options?.maxPrice !== undefined) {
      filteredBooks = filteredBooks.filter(book => 
        book.price <= options.maxPrice!
      );
    }
    
    return filteredBooks;
  }
}

async function upstashVectorSearch(
  queryVector: number[],
  topK: number,
  sparseVector?: SparseVector,
): Promise<VectorSearchResult[]> {
  if (!upstashIndex) {
    throw new Error('Upstash Vector is not configured');
  }

  const query: {
    vector: number[];
    topK: number;
    includeMetadata: boolean;
    sparseVector?: SparseVector;
  } = {
    vector: queryVector,
    topK,
    includeMetadata: true,
  };

  if (sparseVector) {
    query.sparseVector = sparseVector;
  }

  const results = await upstashIndex.query(query) as Array<{
    id: string | number;
    score: number;
    metadata: Record<string, unknown> | undefined;
  }>;

  const validResults: VectorSearchResult[] = [];
  for (const result of results) {
    if (
      typeof result.id === 'string' &&
      typeof result.metadata === 'object' &&
      result.metadata !== null
    ) {
      const m = result.metadata;
      if (
        typeof m.bookId === 'string' &&
        typeof m.title === 'string' &&
        typeof m.author === 'string' &&
        typeof m.category === 'string'
      ) {
        validResults.push({
          id: result.id,
          score: result.score,
          metadata: {
            bookId: m.bookId,
            title: m.title,
            author: m.author,
            category: m.category,
            description: (m.description as string) || '',
          },
        });
      }
    }
  }
  return validResults;
}

export async function upsertChunkVector(
  bookId: string,
  chunkIndex: number,
  vector: number[],
  metadata: ChunkMetadata,
  sparseVector?: SparseVector,
): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    await upstashUpsertChunkVector(bookId, chunkIndex, vector, metadata, sparseVector);
  } else {
    await pgUpsertChunkVector(bookId, chunkIndex, vector, metadata);
  }
}

async function upstashUpsertChunkVector(
  bookId: string,
  chunkIndex: number,
  vector: number[],
  metadata: ChunkMetadata,
  sparseVector?: SparseVector,
): Promise<void> {
  if (!upstashIndex) {
    throw new Error('Upstash Vector is not configured');
  }

  const chunkId = `chunk:${bookId}:${chunkIndex}`;
  const document = metadata.text || [metadata.title, metadata.author, metadata.category]
    .filter(Boolean)
    .join('\n');

  const metadataRecord: Record<string, unknown> = {
    bookId: metadata.bookId,
    chunkIndex: metadata.chunkIndex,
    text: metadata.text,
  };

  if (metadata.title) metadataRecord.title = metadata.title;
  if (metadata.author) metadataRecord.author = metadata.author;
  if (metadata.category) metadataRecord.category = metadata.category;

  await upstashIndex.upsert([
    {
      id: chunkId,
      vector,
      sparseVector: sparseVector ?? buildSparseVector(document),
      metadata: metadataRecord,
    },
  ]);
}

export async function vectorSearchChunks(
  queryVector: number[],
  topK: number = 10,
  filter?: { bookId?: string; category?: string },
): Promise<ChunkSearchResult[]> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    return upstashVectorSearchChunks(queryVector, topK, filter);
  } else {
    return pgVectorSearchChunks(queryVector, topK, filter);
  }
}

async function upstashVectorSearchChunks(
  queryVector: number[],
  topK: number,
  _filter?: { bookId?: string; category?: string },
): Promise<ChunkSearchResult[]> {
  if (!upstashIndex) {
    throw new Error('Upstash Vector is not configured');
  }

  const results = await upstashIndex.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  }) as Array<{
    id: string | number;
    score: number;
    metadata: Record<string, unknown> | undefined;
  }>;

  const validResults: ChunkSearchResult[] = [];
  for (const result of results) {
    if (
      typeof result.id === 'string' &&
      typeof result.metadata === 'object' &&
      result.metadata !== null
    ) {
      const m = result.metadata;
      if (
        typeof m.bookId === 'string' &&
        typeof m.chunkIndex === 'number' &&
        typeof m.text === 'string'
      ) {
        validResults.push({
          id: result.id,
          score: result.score,
          metadata: {
            bookId: m.bookId,
            chunkIndex: m.chunkIndex,
            text: m.text,
          },
        });
      }
    }
  }
  return validResults;
}

export async function deleteBookVector(bookId: string): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    if (!upstashIndex) {
      throw new Error('Upstash Vector is not configured');
    }
    await upstashIndex.delete([bookId.toString()]);
  } else {
    await pgDeleteBookVector(bookId);
  }
}

export async function deleteChunkVectors(bookIds: string[]): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    if (!upstashIndex) {
      throw new Error('Upstash Vector is not configured');
    }
    const chunkIds = bookIds.flatMap((id) => [
      `chunk:${id}:0`,
      `chunk:${id}:1`,
      `chunk:${id}:2`,
    ]);
    await upstashIndex.delete(chunkIds);
  } else {
    await pgDeleteChunkVectorsByBookIds(bookIds);
  }
}

export async function deleteAllBookChunks(bookId: string): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    if (!upstashIndex) {
      throw new Error('Upstash Vector is not configured');
    }
    const CHUNK_NAMESPACE = `chunk:${bookId}`;
    await upstashIndex.delete({ prefix: CHUNK_NAMESPACE });
  } else {
    await pgDeleteChunkVectorsByBookIds([bookId]);
  }
}

export async function getVectorStoreInfo(): Promise<VectorStoreInfo | null> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    if (!upstashIndex) return null;
    try {
      const info = await upstashIndex.info();
      return {
        backend: 'upstash',
        vectorCount: (info as unknown as Record<string, number>).vectorCount ?? 0,
        dimension: (info as unknown as Record<string, number>).dimension ?? 0,
        supported: true,
      };
    } catch {
      return null;
    }
  } else {
    try {
      const supported = await pgHasPgVectorSupport();
      if (!supported) {
        return { backend: 'pgvector', vectorCount: 0, dimension: VECTOR_DIMENSION, supported: false };
      }
      const count = await pgGetBookEmbeddingCount();
      return {
        backend: 'pgvector',
        vectorCount: count,
        dimension: VECTOR_DIMENSION,
        supported: true,
      };
    } catch {
      return null;
    }
  }
}

export function hasVectorSupport(): boolean {
  return upstashIndex !== null || true;
}

export { getVectorBackend };
