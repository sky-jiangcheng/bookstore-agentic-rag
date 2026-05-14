/**
 * Feedback Store - Classic RAG Component
 *
 * Stores and retrieves user feedback for continuous learning and relevance improvement.
 */

import crypto from 'crypto';
import { redis } from '@/lib/upstash';
import type { UserFeedback, FeedbackStats } from '@/lib/types/rag';

const FEEDBACK_PREFIX = 'rag:feedback:';
const STATS_PREFIX = 'rag:stats:';
const SESSION_FEEDBACK_PREFIX = 'rag:session:';

/**
 * Store user feedback
 */
export async function storeFeedback(feedback: Omit<UserFeedback, 'id'>): Promise<UserFeedback> {
  const id = `feedback-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
  const fullFeedback: UserFeedback = {
    ...feedback,
    id,
  };

  // Store feedback in Redis
  if (redis) {
    await redis.hset(`${FEEDBACK_PREFIX}${id}`, fullFeedback as unknown as Record<string, unknown>);
    await redis.expire(`${FEEDBACK_PREFIX}${id}`, 60 * 60 * 24 * 30); // 30 days TTL

    // Add to session feedback list
    await redis.sadd(`${SESSION_FEEDBACK_PREFIX}${feedback.sessionId}`, id);

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

  const feedbackIds = await redis.smembers<string[]>(`${SESSION_FEEDBACK_PREFIX}${sessionId}`);

  if (!feedbackIds || feedbackIds.length === 0) {
    return [];
  }

  const feedbackPromises = feedbackIds.map(async (id) => {
    const feedback = await redis!.hgetall(`${FEEDBACK_PREFIX}${id}`);
    return feedback as UserFeedback | null;
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

  const statsKey = `${STATS_PREFIX}book:${bookId}`;
  const stats = await redis.hgetall(statsKey);

  if (!stats || Object.keys(stats).length === 0) {
    return {
      bookId,
      positiveCount: 0,
      negativeCount: 0,
      averageScore: 0,
      totalFeedback: 0,
    };
  }

  return {
    bookId,
    positiveCount: Number(stats.positiveCount || 0),
    negativeCount: Number(stats.negativeCount || 0),
    averageScore: Number(stats.averageScore || 0),
    totalFeedback: Number(stats.totalFeedback || 0),
  };
}

/**
 * Update feedback statistics
 */
async function updateFeedbackStats(
  bookId: string,
  feedbackType: UserFeedback['feedbackType'],
): Promise<void> {
  if (!redis) {
    return;
  }

  const statsKey = `${STATS_PREFIX}book:${bookId}`;

  // Get current stats
  const current = await getFeedbackStats(bookId) || {
    positiveCount: 0,
    negativeCount: 0,
    averageScore: 0,
    totalFeedback: 0,
  };

  // Update based on feedback type
  let positiveCount = current.positiveCount;
  let negativeCount = current.negativeCount;
  let scoreIncrement = 0;

  switch (feedbackType) {
    case 'thumbs_up':
      positiveCount++;
      scoreIncrement = 1;
      break;
    case 'thumbs_down':
      negativeCount++;
      scoreIncrement = -1;
      break;
    case 'not_relevant':
      negativeCount++;
      scoreIncrement = -0.5;
      break;
    case 'click':
      // Neutral feedback - slight positive boost
      scoreIncrement = 0.1;
      break;
  }

  const totalFeedback = current.totalFeedback + 1;
  const averageScore = (current.averageScore * current.totalFeedback + scoreIncrement) / totalFeedback;

  // Save updated stats
  await redis.hset(statsKey, {
    bookId,
    positiveCount,
    negativeCount,
    averageScore,
    totalFeedback,
  });

  await redis.expire(statsKey, 60 * 60 * 24 * 30); // 30 days TTL
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
    const scanResult = await redis.scan(cursor, {
      match: `${STATS_PREFIX}book:*`,
      count: 100,
    });

    cursor = typeof scanResult[0] === 'string' ? scanResult[0] : String(scanResult[0]);
    const keys: string[] = Array.isArray(scanResult[1]) ? scanResult[1] : [];

    for (const key of keys) {
      try {
        const stats = await redis.hgetall(key);
        if (stats && Object.keys(stats).length > 0) {
          allStats.push({
            bookId: String(stats.bookId || key.replace(`${STATS_PREFIX}book:`, '')),
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

  // In production, implement cleanup logic
  console.log(`[feedback] Clearing feedback older than ${daysOld} days`);
  return 0;
}
