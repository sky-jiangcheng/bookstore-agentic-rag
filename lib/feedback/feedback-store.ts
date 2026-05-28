/**
 * Feedback Store - Classic RAG Component
 *
 * Stores and retrieves user feedback for continuous learning and relevance improvement.
 */

import crypto from 'crypto';
import { redis } from '@/lib/upstash';
import type { UserFeedback, FeedbackStats } from '@/lib/types/rag';
import { getStringSetMembers } from '@/lib/utils/redis-helpers';
import { REDIS_KEYS, TTL } from '@/lib/utils/redis-keys';

/**
 * Store user feedback
 */
export async function storeFeedback(feedback: Omit<UserFeedback, 'id'>): Promise<UserFeedback> {
  const id = `feedback-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
  const fullFeedback: UserFeedback = {
    ...feedback,
    id,
  };

  // Store feedback in Redis using JSON serialization
  if (redis) {
    await redis.set(REDIS_KEYS.feedback(id), JSON.stringify(fullFeedback));
    await redis.expire(REDIS_KEYS.feedback(id), TTL.FEEDBACK);

    // Add to session feedback list
    const sessionFeedbackKey = REDIS_KEYS.sessionFeedback(feedback.sessionId);
    await redis.sadd(sessionFeedbackKey, id);
    await redis.expire(sessionFeedbackKey, TTL.FEEDBACK);

    // Update feedback stats
    await updateFeedbackStats(feedback.bookId, feedback.feedbackType);
  } else {
    console.warn('[feedback] Redis not available, feedback not persisted');
  }

  return fullFeedback;
}

/**
 * Get feedback for a session
 */
export async function getSessionFeedback(sessionId: string): Promise<UserFeedback[]> {
  if (!redis) {
    return [];
  }

  const feedbackIds = await getStringSetMembers(REDIS_KEYS.sessionFeedback(sessionId), redis);

  if (!feedbackIds || feedbackIds.length === 0) {
    return [];
  }

  const feedbackPromises = feedbackIds.map(async (id) => {
    const raw = await redis!.get<string>(REDIS_KEYS.feedback(id));
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as UserFeedback;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(feedbackPromises);
  return results.filter((f): f is UserFeedback => f !== null);
}

/**
 * Get feedback statistics for a book
 */
export async function getFeedbackStats(bookId: string): Promise<FeedbackStats | null> {
  if (!redis) {
    return null;
  }

  const statsKey = REDIS_KEYS.stats(bookId);
  const raw = await redis.get<string>(statsKey);

  if (!raw || typeof raw !== 'string') {
    return {
      bookId,
      positiveCount: 0,
      negativeCount: 0,
      averageScore: 0,
      totalFeedback: 0,
    };
  }

  try {
    const stats = JSON.parse(raw) as FeedbackStats;
    return {
      bookId,
      positiveCount: Number(stats.positiveCount || 0),
      negativeCount: Number(stats.negativeCount || 0),
      averageScore: Number(stats.averageScore || 0),
      totalFeedback: Number(stats.totalFeedback || 0),
    };
  } catch {
    return {
      bookId,
      positiveCount: 0,
      negativeCount: 0,
      averageScore: 0,
      totalFeedback: 0,
    };
  }
}

/**
 * Lua script for atomic feedback stats update.
 * Guarantees no lost updates even under concurrent writes.
 */
const UPDATE_STATS_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local positiveDelta = tonumber(ARGV[2])
local negativeDelta = tonumber(ARGV[3])
local scoreDelta = tonumber(ARGV[4])

local raw = redis.call('GET', key)
local stats = {}
if raw then
  stats = cjson.decode(raw)
end

local totalFeedback = (stats.totalFeedback or 0) + 1
local prevTotal = stats.totalFeedback or 0
local prevAvg = stats.averageScore or 0
local averageScore = (prevAvg * prevTotal + scoreDelta) / totalFeedback

stats.bookId = KEYS[2]
stats.positiveCount = (stats.positiveCount or 0) + positiveDelta
stats.negativeCount = (stats.negativeCount or 0) + negativeDelta
stats.averageScore = math.floor(averageScore * 10000 + 0.5) / 10000
stats.totalFeedback = totalFeedback

redis.call('SET', key, cjson.encode(stats))
redis.call('EXPIRE', key, ttl)
return cjson.encode(stats)
`;

/**
 * Update feedback statistics atomically via Lua script.
 */
async function updateFeedbackStats(
  bookId: string,
  feedbackType: UserFeedback['feedbackType'],
): Promise<void> {
  if (!redis) {
    return;
  }

  const statsKey = REDIS_KEYS.stats(bookId);
  const ttl = TTL.FEEDBACK;

  let positiveDelta = 0;
  let negativeDelta = 0;
  let scoreDelta = 0;

  switch (feedbackType) {
    case 'thumbs_up':
      positiveDelta = 1;
      scoreDelta = 1;
      break;
    case 'thumbs_down':
      negativeDelta = 1;
      scoreDelta = -1;
      break;
    case 'not_relevant':
      negativeDelta = 1;
      scoreDelta = -0.5;
      break;
    case 'click':
      scoreDelta = 0.1;
      break;
  }

  try {
    await redis.eval(
      UPDATE_STATS_SCRIPT,
      [statsKey, bookId],
      [String(ttl), String(positiveDelta), String(negativeDelta), String(scoreDelta)]
    );
  } catch (error) {
    console.error('[feedback] Failed to update stats atomically:', error);
    // Fallback: non-atomic update
    const current = await getFeedbackStats(bookId) || {
      positiveCount: 0,
      negativeCount: 0,
      averageScore: 0,
      totalFeedback: 0,
    };
    const totalFeedback = current.totalFeedback + 1;
    const averageScore = (current.averageScore * current.totalFeedback + scoreDelta) / totalFeedback;
    await redis.set(statsKey, JSON.stringify({
      bookId,
      positiveCount: current.positiveCount + positiveDelta,
      negativeCount: current.negativeCount + negativeDelta,
      averageScore,
      totalFeedback,
    }));
    await redis.expire(statsKey, ttl);
  }
}

/**
 * Get books with positive feedback for similar queries
 */
export async function getBoostedBooks(
  query: string,
  limit: number = 5,
): Promise<string[]> {
  if (!redis) {
    return [];
  }

  // Simple keyword matching on query
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);

  if (keywords.length === 0) {
    return [];
  }

  // In a real implementation, you would:
  // 1. Index feedback by query keywords
  // 2. Use more sophisticated similarity matching
  // 3. Consider user personalization

  // For now, return books with high positive feedback
  const allStats = await getAllFeedbackStats();
  const sorted = allStats
    .filter(s => s.positiveCount > 0)
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, limit);

  return sorted.map(s => s.bookId);
}

/**
 * Get all feedback statistics
 */
async function getAllFeedbackStats(): Promise<FeedbackStats[]> {
  if (!redis) {
    return [];
  }

  // Scan all stats keys matching the pattern
  const allStats: FeedbackStats[] = [];
  let cursor: string | number = 0;

  do {
    const scanResult: [cursor: string | number, keys: string[]] = await redis.scan(cursor, {
      match: 'rag:stats:book:*',
      count: 100,
    });

    cursor = typeof scanResult[0] === 'string' ? scanResult[0] : String(scanResult[0]);
    const keys: string[] = Array.isArray(scanResult[1]) ? scanResult[1] : [];

    for (const key of keys) {
      try {
        const raw = await redis.get<string>(key);
        if (raw && typeof raw === 'string') {
          const stats = JSON.parse(raw) as FeedbackStats;
          allStats.push({
            bookId: String(stats.bookId || key.replace('rag:stats:book:', '')),
            positiveCount: Number(stats.positiveCount || 0),
            negativeCount: Number(stats.negativeCount || 0),
            averageScore: Number(stats.averageScore || 0),
            totalFeedback: Number(stats.totalFeedback || 0),
          });
        }
      } catch (error) {
        console.error(`[feedback] Failed to read stats for key ${key}:`, error);
      }
    }
  } while (Number(cursor) !== 0);

  return allStats;
}

/**
 * Clear old feedback data
 */
export async function clearOldFeedback(daysOld: number = 30): Promise<number> {
  if (!redis) {
    return 0;
  }

  const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  let cursor: string | number = 0;
  let deletedCount = 0;

  do {
    const scanResult: [cursor: string | number, keys: string[]] = await redis.scan(cursor, {
      match: 'rag:feedback:*',
      count: 100,
    });

    cursor = typeof scanResult[0] === 'string' ? scanResult[0] : String(scanResult[0]);
    const keys: string[] = Array.isArray(scanResult[1]) ? scanResult[1] : [];

    for (const key of keys) {
      try {
        const raw = await redis.get<string>(key);
        if (!raw || typeof raw !== 'string') continue;

        let feedback: Record<string, unknown>;
        try {
          feedback = JSON.parse(raw);
        } catch {
          continue;
        }

        const timestamp = Number(feedback?.timestamp || key.match(/^rag:feedback:feedback-(\d+)-/)?.[1] || 0);

        if (timestamp > 0 && timestamp < cutoffTime) {
          const feedbackId = String(feedback?.id || key.replace('rag:feedback:', ''));
          const sessionId = typeof feedback?.sessionId === 'string' ? feedback.sessionId : '';

          await redis.del(key);
          if (sessionId) {
            await redis.srem(REDIS_KEYS.sessionFeedback(sessionId), feedbackId);
          }
          deletedCount++;
        }
      } catch (error) {
        console.error(`[feedback] Failed to clear old feedback key ${key}:`, error);
      }
    }
  } while (Number(cursor) !== 0);

  return deletedCount;
}
