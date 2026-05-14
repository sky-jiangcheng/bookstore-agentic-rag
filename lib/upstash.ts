// lib/upstash.ts
import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';
import { config, hasRedisConfig, hasVectorConfig } from '@/lib/config/environment';
import { buildBookDocument, buildSparseVector } from './local-vector';

const vectorIndex = hasVectorConfig()
  ? new Index({
      url: config.upstash.vectorUrl,
      token: config.upstash.vectorToken,
    })
  : null;

export const redis = hasRedisConfig()
  ? new Redis({
      url: config.upstash.redisUrl,
      token: config.upstash.redisToken,
    })
  : null;

export interface VectorBook {
  id: string;
  vector: number[];
  bookId: string;
  title: string;
  author: string;
  category: string;
  description: string;
  sourceId?: string;
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

export async function upsertBookVector(
  bookId: string,
  vector: number[],
  metadata: Omit<VectorBook, 'id' | 'vector'>,
  sparseVector?: SparseVector,
): Promise<void> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  const document = buildBookDocument(metadata);

  await vectorIndex.upsert([
    {
      id: bookId.toString(),
      vector,
      sparseVector: sparseVector ?? buildSparseVector(document),
      metadata,
    },
  ]);
}

export interface VectorBookMetadata {
  bookId: string;
  title: string;
  author: string;
  category: string;
  description: string;
  sourceId?: string;
}

function isValidVectorBookMetadata(metadata: unknown): metadata is VectorBookMetadata {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const m = metadata as Record<string, unknown>;
  return (
    typeof m.bookId === 'string' &&
    typeof m.title === 'string' &&
    typeof m.author === 'string' &&
    typeof m.category === 'string' &&
    typeof m.description === 'string'
  );
}

function isValidChunkMetadata(metadata: unknown): metadata is ChunkMetadata {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const m = metadata as Record<string, unknown>;
  return (
    typeof m.bookId === 'string' &&
    typeof m.chunkIndex === 'number' &&
    typeof m.text === 'string'
  );
}

export async function vectorSearch(
  queryVector: number[],
  topK: number = 10,
  sparseVector?: SparseVector,
): Promise<{ id: string; score: number; metadata: VectorBookMetadata }[]> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  const query: {
    vector: number[];
    topK: number;
    includeMetadata: true;
    sparseVector?: SparseVector;
  } = {
    vector: queryVector,
    topK,
    includeMetadata: true,
  };

  if (sparseVector) {
    query.sparseVector = sparseVector;
  }

  const results = await vectorIndex.query(query) as Array<{ id: string | number; score: number; metadata: Record<string, unknown> | undefined }>;

  // Validate and filter results
  const validResults: Array<{ id: string; score: number; metadata: VectorBookMetadata }> = [];
  for (const result of results) {
    if (typeof result.id === 'string' && isValidVectorBookMetadata(result.metadata)) {
      validResults.push({ id: result.id, score: result.score, metadata: result.metadata });
    }
  }
  return validResults;
}

export async function deleteBookVector(bookId: string): Promise<void> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  await vectorIndex.delete([bookId.toString()]);
}

/**
 * Chunk vector operations for Classic RAG
 */

export interface ChunkMetadata {
  bookId: string;
  chunkIndex: number;
  text: string;
  title?: string;
  author?: string;
  category?: string;
}

export async function upsertChunkVector(
  chunkId: string,
  vector: number[],
  metadata: ChunkMetadata,
  sparseVector?: SparseVector,
): Promise<void> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  const document = metadata.text || [metadata.title, metadata.author, metadata.category].filter(Boolean).join('\n');

  await vectorIndex.upsert([
    {
      id: chunkId,
      vector,
      sparseVector: sparseVector ?? buildSparseVector(document),
      metadata: metadata as unknown as Record<string, unknown>,
    },
  ]);
}

export async function vectorSearchChunks(
  queryVector: number[],
  topK: number = 10,
  _filter?: { bookId?: string; category?: string },
): Promise<{ id: string; score: number; metadata: ChunkMetadata }[]> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  const results = await vectorIndex.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  }) as Array<{ id: string | number; score: number; metadata: Record<string, unknown> | undefined }>;

  // Validate and filter results
  const validResults: Array<{ id: string; score: number; metadata: ChunkMetadata }> = [];
  for (const result of results) {
    if (typeof result.id === 'string' && isValidChunkMetadata(result.metadata)) {
      validResults.push({ id: result.id, score: result.score, metadata: result.metadata });
    }
  }
  return validResults;
}

export async function deleteChunkVectors(chunkIds: string[]): Promise<void> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  await vectorIndex.delete(chunkIds);
}

export async function deleteAllBookChunks(bookId: string): Promise<void> {
  if (!vectorIndex) {
    throw new Error('Vector search is not available');
  }

  // Delete all chunks belonging to this book using prefix-based deletion
  const CHUNK_NAMESPACE = `chunk:${bookId}`;

  try {
    const result = await vectorIndex.delete({ prefix: CHUNK_NAMESPACE });
    console.log(`[upstash] Deleted ${result.deleted} chunks for book ${bookId}`);
  } catch (error) {
    console.error(`[upstash] Failed to delete chunks for book ${bookId}:`, error);
    throw error;
  }
}
