export const REDIS_KEYS = {
  session: (id: string) => `rag:session:${id}`,
  sessionList: 'rag:sessions:',
  feedback: (id: string) => `rag:feedback:${id}`,
  stats: (bookId: string) => `rag:stats:book:${bookId}`,
  sessionFeedback: (sessionId: string) => `rag:sessionfb:${sessionId}`,
  booklistSession: (requestId: string) => `booklist:session:${requestId}`,
} as const;

export const TTL = {
  FEEDBACK: 60 * 60 * 24 * 30,
  SESSION: 60 * 60,
} as const;
