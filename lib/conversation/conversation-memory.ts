/**
 * Conversation Memory - Classic RAG Component
 *
 * Manages multi-turn conversation context for improved user experience.
 * Enables the system to remember previous queries and recommendations.
 */

import crypto from 'crypto';
import { redis } from '@/lib/upstash';
import type { ConversationSession, ConversationTurn } from '@/lib/types/rag';

const SESSION_PREFIX = 'rag:session:';
const SESSION_LIST_PREFIX = 'rag:sessions:';

const DEFAULT_TTL = 60 * 60; // 1 hour
const MAX_TURNS_PER_SESSION = 20;

// 自动清理：模块加载时立即清理过期 session，之后每 30 分钟清理一次
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function startAutoCleanup(): void {
  // 延迟 5 秒后执行首次清理，避免启动时与数据库连接竞争
  setTimeout(() => {
    cleanupOldSessions(DEFAULT_TTL * 1000).catch((err) =>
      console.error('[conversation] Auto-cleanup failed:', err),
    );
  }, 5000);

  // 每 30 分钟执行一次清理
  setInterval(() => {
    cleanupOldSessions(DEFAULT_TTL * 1000).catch((err) =>
      console.error('[conversation] Auto-cleanup failed:', err),
    );
  }, CLEANUP_INTERVAL_MS);
}

// 仅在非构建阶段启动自动清理
if (typeof process !== 'undefined' && process.env?.NEXT_PHASE !== 'phase-production-build') {
  startAutoCleanup();
}

/**
 * Create a new conversation session
 */
export async function createSession(userId?: string): Promise<ConversationSession> {
  const sessionId = generateSessionId();
  const now = Date.now();

  const session: ConversationSession = {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    turns: [],
    metadata: {
      userId,
      startTime: now,
      turnCount: 0,
    },
  };

  await saveSession(session);

  return session;
}

/**
 * Get a conversation session by ID
 */
export async function getSession(sessionId: string): Promise<ConversationSession | null> {
  if (!redis) {
    return null;
  }

  const sessionData = await redis.hgetall(`${SESSION_PREFIX}${sessionId}`);

  if (!sessionData || Object.keys(sessionData).length === 0) {
    return null;
  }

  // Redis HGETALL returns all values as strings; nested objects need JSON.parse
  const parsed = { ...sessionData } as Record<string, unknown>;
  if (typeof parsed.turns === 'string') {
    try {
      parsed.turns = JSON.parse(parsed.turns as string);
    } catch {
      parsed.turns = [];
    }
  }
  if (typeof parsed.metadata === 'string') {
    try {
      parsed.metadata = JSON.parse(parsed.metadata as string);
    } catch {
      parsed.metadata = { startTime: parsed.createdAt ? Number(parsed.createdAt) : Date.now(), turnCount: 0 };
    }
  }
  // Ensure numeric fields
  parsed.createdAt = Number(parsed.createdAt) || 0;
  parsed.updatedAt = Number(parsed.updatedAt) || 0;

  return parsed as unknown as ConversationSession;
}

/**
 * Add a turn to a conversation session
 */
export async function addTurn(
  sessionId: string,
  turn: Omit<ConversationTurn, 'id' | 'sessionId'>,
): Promise<ConversationTurn> {
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const newTurn: ConversationTurn = {
    id: `turn-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`,
    sessionId,
    ...turn,
  };

  session.turns.push(newTurn);
  session.updatedAt = Date.now();
  session.metadata.turnCount = session.turns.length;

  // Limit number of turns per session
  if (session.turns.length > MAX_TURNS_PER_SESSION) {
    session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION);
  }

  await saveSession(session);

  return newTurn;
}

/**
 * Get recent turns from a session
 */
export async function getRecentTurns(
  sessionId: string,
  count: number = 5,
): Promise<ConversationTurn[]> {
  const session = await getSession(sessionId);

  if (!session) {
    return [];
  }

  return session.turns.slice(-count);
}

/**
 * Get full conversation history for a session
 */
export async function getConversationHistory(sessionId: string): Promise<ConversationTurn[]> {
  const session = await getSession(sessionId);
  return session?.turns || [];
}

/**
 * Get conversation context for LLM prompt
 */
export async function getConversationContext(
  sessionId: string,
  maxTurns: number = 3,
): Promise<string> {
  const recentTurns = await getRecentTurns(sessionId, maxTurns);

  if (recentTurns.length === 0) {
    return '';
  }

  const contextLines = recentTurns.map((turn, _index) => {
    const role = turn.role === 'user' ? '用户' : '助手';
    const content = turn.content;

    // Add requirement analysis if available
    if (turn.role === 'user' && turn.requirement) {
      const req = turn.requirement;
      const categories = req.categories.length > 0 ? req.categories.join(', ') : '无';
      const keywords = req.keywords.length > 0 ? req.keywords.join(', ') : '无';

      return `${role}: ${content}\n  (需求分析: 分类=[${categories}], 关键词=[${keywords}])`;
    }

    return `${role}: ${content}`;
  });

  return `历史对话:\n${contextLines.join('\n')}\n`;
}

/**
 * Check if a session exists and is active
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) {
    return false;
  }

  // Check if session is not too old (24 hours)
  const maxAge = 24 * 60 * 60 * 1000;
  return (Date.now() - session.updatedAt) < maxAge;
}

/**
 * Update session metadata
 */
export async function updateSessionMetadata(
  sessionId: string,
  metadata: Partial<ConversationSession['metadata']>,
): Promise<void> {
  const session = await getSession(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  session.metadata = {
    ...session.metadata,
    ...metadata,
  };

  await saveSession(session);
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!redis) {
    return;
  }

  await redis.del(`${SESSION_PREFIX}${sessionId}`);
}

/**
 * Clean up old sessions
 */
export async function cleanupOldSessions(maxAgeMs: number = DEFAULT_TTL * 1000): Promise<number> {
  if (!redis) {
    return 0;
  }

  const cutoffTime = Date.now() - maxAgeMs;
  let deletedCount = 0;

  try {
    // Get all session IDs from the session list set
    const sessionIds = await redis.smembers<string[]>(SESSION_LIST_PREFIX);

    if (!sessionIds || sessionIds.length === 0) {
      return 0;
    }

    for (const sessionId of sessionIds) {
      try {
        const sessionData = await redis.hgetall(`${SESSION_PREFIX}${sessionId}`);

        if (!sessionData || Object.keys(sessionData).length === 0) {
          // Session data is gone, remove from list
          await redis.srem(SESSION_LIST_PREFIX, sessionId);
          deletedCount++;
          continue;
        }

        const updatedAt = Number(sessionData.updatedAt || sessionData.createdAt || 0);

        if (updatedAt > 0 && updatedAt < cutoffTime) {
          await redis.del(`${SESSION_PREFIX}${sessionId}`);
          await redis.srem(SESSION_LIST_PREFIX, sessionId);
          deletedCount++;
        }
      } catch (error) {
        console.error(`[conversation] Failed to check session ${sessionId}:`, error);
      }
    }

    console.log(`[conversation] Cleaned up ${deletedCount} old sessions`);
  } catch (error) {
    console.error('[conversation] Session cleanup failed:', error);
  }

  return deletedCount;
}

/**
 * Get or create a session (helper function)
 */
export async function getOrCreateSession(sessionId?: string, userId?: string): Promise<ConversationSession> {
  if (sessionId && await isSessionActive(sessionId)) {
    const session = await getSession(sessionId);
    if (session) {
      return session;
    }
  }

  return createSession(userId);
}

/**
 * Save a session to Redis
 */
async function saveSession(session: ConversationSession): Promise<void> {
  if (!redis) {
    console.warn('[conversation] Redis not available, session not persisted');
    return;
  }

  const sessionKey = `${SESSION_PREFIX}${session.id}`;

  // Save session data
  await redis.hset(sessionKey, session as unknown as Record<string, unknown>);
  await redis.expire(sessionKey, DEFAULT_TTL);

  // Add to session list for cleanup
  await redis.sadd(SESSION_LIST_PREFIX, session.id);
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').substring(0, 13);
  return `sess-${timestamp}-${random}`;
}

/**
 * Format conversation for display
 */
export function formatConversation(turns: ConversationTurn[]): string {
  if (turns.length === 0) {
    return '无历史对话';
  }

  return turns
    .map((turn) => {
      const role = turn.role === 'user' ? '用户' : '助手';
      return `${role}: ${turn.content}`;
    })
    .join('\n');
}
