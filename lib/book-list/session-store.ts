import 'server-only';

import { redis } from '@/lib/upstash';
import type { BookListParseSession } from '@/lib/book-list/types';

const KEY_PREFIX = 'booklist:session:';
const TTL_SEC = 60 * 60;

const memoryFallback = new Map<string, BookListParseSession>();

export async function saveBookListParseSession(
  requestId: string,
  session: BookListParseSession,
): Promise<void> {
  if (redis) {
    await redis.set(`${KEY_PREFIX}${requestId}`, JSON.stringify(session), { ex: TTL_SEC });
    return;
  }
  memoryFallback.set(requestId, session);
  if (memoryFallback.size > 5000) {
    const first = memoryFallback.keys().next().value;
    if (first) memoryFallback.delete(first);
  }
}

export async function getBookListParseSession(
  requestId: string,
): Promise<BookListParseSession | null> {
  if (redis) {
    const raw = await redis.get<string>(`${KEY_PREFIX}${requestId}`);
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    try {
      return JSON.parse(raw) as BookListParseSession;
    } catch {
      return null;
    }
  }
  return memoryFallback.get(requestId) ?? null;
}
