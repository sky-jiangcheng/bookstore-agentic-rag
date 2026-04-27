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
 */
export class SimpleVectorSearch {
  private cache: Map<string, { vector: number[]; metadata: Record<string, unknown> }> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Upsert a vector into memory cache
   */
  async upsert(id: string, vector: number[], metadata: Record<string, unknown>): Promise<void> {
    this.cache.set(id, { vector, metadata });
    this.cacheExpiry.set(id, Date.now() + this.CACHE_TTL);

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

    // Clean expired entries
    const now = Date.now();
    for (const [id, expiry] of this.cacheExpiry.entries()) {
      if (expiry < now) {
        this.cache.delete(id);
        this.cacheExpiry.delete(id);
      }
    }

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
      return cached;
    }

    // Try to fetch from Vercel KV
    const data = await kv.hgetall<{ vector: string; metadata: string }>('vector:' + id);
    if (data && data.vector && data.metadata) {
      return {
        vector: JSON.parse(data.vector),
        metadata: JSON.parse(data.metadata),
      };
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
   * Load vectors from database into cache
   */
  async loadFromDatabase(): Promise<void> {
    try {
      const result = await sql`
        SELECT id, title, author, category
        FROM books
        LIMIT 1000
      `;

      console.log(`[VectorSearch] Loading ${result.rows.length} books into cache`);
      // Note: Vectors should be pre-computed and stored
      // This is a placeholder for the actual implementation
    } catch (error) {
      console.error('[VectorSearch] Failed to load from database:', error);
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

  async getStats(_bookId: string): Promise<{
    positive: number;
    negative: number;
  }> {
    // In production, you'd maintain aggregated stats
    // For now, return default values
    return { positive: 0, negative: 0 };
  }
}

// Singleton instances
export const vectorSearch = new SimpleVectorSearch();
export const conversationMemory = new VercelConversationMemory();
export const feedbackStore = new VercelFeedbackStore();
