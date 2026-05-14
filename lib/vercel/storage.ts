/**
 * Vercel-Compatible Storage Layer
 *
 * Simplified storage for Vercel free tier deployment.
 * Uses Vercel Postgres and Vercel KV instead of Upstash Vector.
 */

import { sql } from '@vercel/postgres';
import { kv } from '@vercel/kv';

/**
 * Simple in-memory vector search using cosine similarity
 * Suitable for small-scale deployments (< 1000 books)
 *
 * WARNING: In Vercel serverless environments, this in-memory cache is NOT
 * shared across function invocations. Each cold start creates a fresh instance.
 * For production serverless deployments, prefer using Vercel KV or a dedicated
 * vector database (e.g., Upstash Vector, Pinecone) instead of this class.
 *
 * The loadFromDatabase() method can be called on each cold start to warm the
 * cache from Vercel Postgres, but this adds latency and is not recommended
 * for large datasets.
 */
export class SimpleVectorSearch {
  private cache: Map<string, { vector: number[]; metadata: Record<string, unknown> }> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_CACHE_ENTRIES = 1000;

  private cacheVector(id: string, vector: number[], metadata: Record<string, unknown>): void {
    this.cache.delete(id);
    this.cacheExpiry.delete(id);
    this.cache.set(id, { vector, metadata });
    this.cacheExpiry.set(id, Date.now() + this.CACHE_TTL);
    this.enforceMaxCacheSize();
  }

  private pruneExpiredEntries(now: number = Date.now()): void {
    for (const [id, expiry] of this.cacheExpiry.entries()) {
      if (expiry < now) {
        this.cache.delete(id);
        this.cacheExpiry.delete(id);
      }
    }
  }

  private enforceMaxCacheSize(): void {
    while (this.cache.size > this.MAX_CACHE_ENTRIES) {
      const oldestId = this.cache.keys().next().value;
      if (typeof oldestId !== 'string') {
        break;
      }
      this.cache.delete(oldestId);
      this.cacheExpiry.delete(oldestId);
    }
  }

  /**
   * Upsert a vector into memory cache
   */
  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    this.cacheVector(id, vector, metadata);

    // Also persist to Vercel KV for retrieval
    await kv.hset('vector:' + id, {
      vector: JSON.stringify(vector),
      metadata: JSON.stringify(metadata),
    });
    await kv.expire('vector:' + id, this.CACHE_TTL / 1000);
  }

  /**
   * Search for similar vectors using cosine similarity
   */
  async query(queryVector: number[], topK: number = 10): Promise<Array<{
    id: string;
    score: number;
    metadata: Record<string, unknown>;
  }>> {
    const results: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

    this.pruneExpiredEntries();

    // Calculate cosine similarity for all vectors
    for (const [id, { vector, metadata }] of this.cache.entries()) {
      const score = cosineSimilarity(queryVector, vector);
      results.push({ id, score, metadata });
    }

    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get a specific vector by ID
   */
  async get(id: string): Promise<{ vector: number[]; metadata: Record<string, unknown> } | null> {
    const cached = this.cache.get(id);
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return cached;
    }

    // Try to fetch from Vercel KV
    const data = await kv.hgetall<{ vector: string; metadata: string }>('vector:' + id);
    if (data && data.vector && data.metadata) {
      const vectorRecord = {
        vector: JSON.parse(data.vector),
        metadata: JSON.parse(data.metadata),
      };
      this.cacheVector(id, vectorRecord.vector, vectorRecord.metadata);
      return vectorRecord;
    }

    return null;
  }

  /**
   * Delete a vector
   */
  async delete(id: string): Promise<void> {
    this.cache.delete(id);
    this.cacheExpiry.delete(id);
    await kv.del('vector:' + id);
  }

  /**
   * Load vectors from Vercel KV into cache
   * This should be called on cold start to warm the cache.
   * Note: For large datasets, this can be slow and memory-intensive.
   */
  async loadFromDatabase(): Promise<number> {
    try {
      // Load pre-computed vectors from Vercel KV
      // Vectors are stored with keys like "vector:<id>"
      // We use scan to find all vector keys
      let loadedCount = 0;

      // Try loading from Vercel KV first (vectors stored by upsert)
      // Since Vercel KV doesn't have SCAN in all tiers, we load from the known books
      const result = await sql`
        SELECT id, title, author, category
        FROM books
        LIMIT 1000
      `;

      for (const row of result.rows) {
        const bookId = String(row.id);
        const cached = this.cache.get(bookId);
        if (!cached) {
          // Try to load from KV
          const data = await kv.hgetall<{ vector: string; metadata: string }>('vector:' + bookId);
          if (data && data.vector && data.metadata) {
            this.cacheVector(bookId, JSON.parse(data.vector), JSON.parse(data.metadata));
            loadedCount++;
          }
        }
      }

      console.log(`[VectorSearch] Loaded ${loadedCount} vectors from Vercel KV (checked ${result.rows.length} books)`);
      return loadedCount;
    } catch (error) {
      console.error('[VectorSearch] Failed to load from database:', error);
      return 0;
    }
  }
}

/**
 * Cosine similarity calculation
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Conversation memory using Vercel KV
 */
export class VercelConversationMemory {
  private readonly PREFIX = 'conv:';
  private readonly TTL = 60 * 60; // 1 hour in seconds

  async get(sessionId: string): Promise<{
    id: string;
    turns: Array<{ role: string; content: string; timestamp: number }>;
  } | null> {
    const data = await kv.get<{ turns: Array<{ role: string; content: string; timestamp: number }> }>(
      this.PREFIX + sessionId
    );

    if (!data) {
      return null;
    }

    return {
      id: sessionId,
      turns: data.turns || [],
    };
  }

  async addTurn(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const session = await this.get(sessionId);
    const turns = session?.turns || [];

    turns.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // Keep only last 10 turns to save space
    const trimmedTurns = turns.slice(-10);

    await kv.set(this.PREFIX + sessionId, { turns: trimmedTurns }, { ex: this.TTL });
  }

  async getContext(sessionId: string, maxTurns: number = 3): Promise<string> {
    const session = await this.get(sessionId);
    if (!session || session.turns.length === 0) {
      return '';
    }

    const recentTurns = session.turns.slice(-maxTurns);
    return recentTurns
      .map(turn => `${turn.role === 'user' ? '用户' : '助手'}: ${turn.content}`)
      .join('\n');
  }

  async delete(sessionId: string): Promise<void> {
    await kv.del(this.PREFIX + sessionId);
  }
}

/**
 * Feedback storage using Vercel KV
 */
export class VercelFeedbackStore {
  private readonly PREFIX = 'feedback:';

  async add(feedback: {
    sessionId: string;
    query: string;
    bookId: string;
    type: 'thumbs_up' | 'thumbs_down' | 'not_relevant';
  }): Promise<void> {
    const key = `${this.PREFIX}${feedback.sessionId}:${Date.now()}`;
    await kv.set(key, feedback, { ex: 60 * 60 * 24 * 30 }); // 30 days
  }

  async getStats(bookId: string): Promise<{
    positive: number;
    negative: number;
  }> {
    try {
      const result = await sql`
        SELECT
          COUNT(*) FILTER (WHERE signal = 'thumbs_up') AS positive,
          COUNT(*) FILTER (WHERE signal IN ('thumbs_down', 'not_relevant')) AS negative
        FROM recommendation_feedback
        WHERE book_id = ${bookId}
      `;

      if (result.rows.length > 0) {
        const row = result.rows[0] as { positive: string | number; negative: string | number };
        return {
          positive: Number(row.positive) || 0,
          negative: Number(row.negative) || 0,
        };
      }

      return { positive: 0, negative: 0 };
    } catch (error) {
      console.error('[VercelFeedbackStore] Failed to get stats:', error);
      return { positive: 0, negative: 0 };
    }
  }
}

// Singleton instances
export const vectorSearch = new SimpleVectorSearch();
export const conversationMemory = new VercelConversationMemory();
export const feedbackStore = new VercelFeedbackStore();
