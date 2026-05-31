/**
 * 向量服务适配层
 * 使用 pgvector (PostgreSQL) 后端
 */

import {
  vectorSearchBooks as pgVectorSearchBooks,
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
  type VectorSearchOptions,
} from './postgres-vector';
import type { Book } from '@/lib/types/rag';

export type { VectorBookMetadata, ChunkMetadata };

const VECTOR_DIMENSION = 768;

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
  options?: VectorSearchOptions,
): Promise<Book[]> {
  return pgVectorSearchBooks(queryVector, topK, options ?? {});
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
  await pgDeleteChunkVectorsByBookIds(bookIds);
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
  return true; // pgvector is always available when PostgreSQL is configured
}
