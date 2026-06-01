/**
 * 向量服务适配层
 * 使用 pgvector (PostgreSQL) 后端
 */

import type { Book } from '@/lib/types/rag';
import {
  vectorSearchBooks as pgVectorSearchBooks,
  upsertBookVector as pgUpsertBookVector,
  getBookEmbeddingCount as pgGetBookEmbeddingCount,
  hasPgVectorSupport as pgHasPgVectorSupport,
  type VectorBookMetadata,
  type VectorSearchResult,
  type VectorSearchOptions,
} from './postgres-vector';

export type { VectorBookMetadata };

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
  return true;
}
