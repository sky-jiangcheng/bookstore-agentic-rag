/**
 * 向量服务适配层
 * 使用 pgvector (PostgreSQL) 后端
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
  type VectorSearchResult,
  type ChunkSearchResult,
} from './postgres-vector';
import type { Book, VectorBookMetadata, ChunkMetadata, SparseVector } from '@/lib/types/rag';

import { Index } from '@upstash/vector';
import { config, hasVectorConfig } from '@/lib/config/environment';
import { buildBookDocument, buildSparseVector } from './local-vector';

export const VECTOR_DIMENSION = 768;

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

export interface VectorStoreInfo {
  backend: 'pgvector';
  vectorCount: number;
  dimension: number;
  supported: boolean;
}

export async function upsertBookVector(
  bookId: string,
  vector: number[],
  metadata: VectorBookMetadata,
): Promise<void> {
  await pgUpsertBookVector(bookId, vector, metadata);
}

export async function vectorSearch(
  queryVector: number[],
  topK: number = 10,
): Promise<VectorSearchResult[]> {
  return pgVectorSearchBooks(queryVector, topK);
}

export async function vectorSearchDirect(
  queryVector: number[],
  topK: number = 10,
  options?: {
    categories?: string[];
    maxPrice?: number;
    queryText?: string;
  },
): Promise<Book[]> {
  return pgVectorSearchBooksDirect(queryVector, topK, options);
}

export async function upsertChunkVector(
  bookId: string,
  chunkIndex: number,
  vector: number[],
  metadata: ChunkMetadata,
): Promise<void> {
  await pgUpsertChunkVector(bookId, chunkIndex, vector, metadata);
}

export async function vectorSearchChunks(
  queryVector: number[],
  topK: number = 10,
  filter?: { bookId?: string; category?: string },
): Promise<ChunkSearchResult[]> {
  return pgVectorSearchChunks(queryVector, topK, filter);
}

export async function deleteBookVector(bookId: string): Promise<void> {
  await pgDeleteBookVector(bookId);
}

export async function deleteChunkVectors(bookIds: string[]): Promise<void> {
  const backend = getVectorBackend();

  if (backend === 'upstash') {
    if (!upstashIndex) {
      throw new Error('Upstash Vector is not configured');
    }
    for (const bookId of bookIds) {
      const namespace = `chunk:${bookId}`;
      await upstashIndex.delete({ prefix: namespace });
    }
  } else {
    await pgDeleteChunkVectorsByBookIds(bookIds);
  }
}

export async function deleteAllBookChunks(bookId: string): Promise<void> {
  // pgvector stores all chunks in the same table — delete all for this book
  await pgDeleteChunkVectorsByBookIds([bookId]);
}

export async function getVectorStoreInfo(): Promise<VectorStoreInfo | null> {
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

export function hasVectorSupport(): boolean {
  return upstashIndex !== null;
}
