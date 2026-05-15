/**
 * Vector Store Initializer
 *
 * Automatically checks and populates the Upstash vector index with book embeddings.
 * No manual step required — triggers lazily on first request when store is empty.
 */

import { getVectorStoreInfo } from '@/lib/upstash';
import { precomputeEmbeddings } from '@/lib/vercel/simplified-retrieval';

/** Singleton flag: prevent concurrent precompute runs */
let isPrecomputing = false;
let precomputeSucceeded = false;
let precomputeFailed = false;

/**
 * Check if vector store has data.
 * Returns:
 *   'has_data'   — vectors exist, ready to use
 *   'empty'      — no vectors, needs precompute
 *   'unchecked'  — no vector config or info query failed
 */
export async function checkVectorStoreStatus(): Promise<'has_data' | 'empty' | 'unchecked'> {
  const info = await getVectorStoreInfo();
  if (info === null) return 'unchecked';
  return info.vectorCount > 0 ? 'has_data' : 'empty';
}

/**
 * Ensure the vector store is populated.
 * Safe to call on every request — only triggers precompute once
 * (on first call that finds the store empty).
 *
 * Returns true if precompute was triggered (fire-and-forget).
 */
export async function ensureVectorStoreReady(): Promise<boolean> {
  if (precomputeSucceeded) return false;
  if (isPrecomputing) return true; // already running
  if (precomputeFailed) return false; // already tried and failed

  const info = await getVectorStoreInfo();
  if (info === null) {
    // No vector config — nothing we can do
    return false;
  }

  if (info.vectorCount > 0) {
    precomputeSucceeded = true;
    return false;
  }

  // Vector store is empty — trigger precompute in background
  isPrecomputing = true;
  precomputeEmbeddings()
    .then(() => {
      precomputeSucceeded = true;
      console.log('[vector-init] Pre-computation completed successfully');
    })
    .catch((err) => {
      precomputeFailed = true;
      console.error('[vector-init] Pre-computation failed:', err);
    })
    .finally(() => {
      isPrecomputing = false;
    });

  return true;
}
