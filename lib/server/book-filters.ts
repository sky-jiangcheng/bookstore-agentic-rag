import 'server-only';

import { sql } from '@vercel/postgres';

import type { Book } from '@/lib/types/rag';

const FILTER_CACHE_TTL_MS = 60_000;

type FilterStatus = {
  enabled: boolean;
  keywords: string[];
  sources: {
    database: boolean;
    env: boolean;
  };
};

let filterCache:
  | {
      expiresAt: number;
      status: FilterStatus;
    }
  | undefined;

function parseKeywordList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\n,;，；]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function deduplicateKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length);
}

async function loadDatabaseKeywords(): Promise<string[]> {
  try {
    const result = await sql<{ keyword: string }>`
      SELECT keyword
      FROM filter_keywords
      WHERE is_active = TRUE
      ORDER BY char_length(keyword) DESC, keyword ASC
    `;

    return result.rows.map((row) => row.keyword).filter(Boolean);
  } catch (error) {
    console.warn('[filters] Failed to load database filter keywords:', error);
    return [];
  }
}

function getBookSearchText(book: Book): string {
  return [
    book.title,
    book.author,
    book.publisher,
    book.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function findBlockedKeyword(book: Book, keywords: string[]): string | null {
  const haystack = getBookSearchText(book);

  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }

  return null;
}

export async function getFilterStatus(forceRefresh: boolean = false): Promise<FilterStatus> {
  const now = Date.now();
  if (!forceRefresh && filterCache && filterCache.expiresAt > now) {
    return filterCache.status;
  }

  const envKeywords = parseKeywordList(process.env.BLOCKED_KEYWORDS || process.env.RAG_BLOCKED_KEYWORDS);
  const databaseKeywords = await loadDatabaseKeywords();
  const keywords = deduplicateKeywords([...databaseKeywords, ...envKeywords]);

  const status: FilterStatus = {
    enabled: keywords.length > 0,
    keywords,
    sources: {
      database: databaseKeywords.length > 0,
      env: envKeywords.length > 0,
    },
  };

  filterCache = {
    expiresAt: now + FILTER_CACHE_TTL_MS,
    status,
  };

  return status;
}

export async function filterBlockedBooks<T extends Book>(books: T[]): Promise<{
  books: T[];
  blocked: Array<{ book: T; keyword: string }>;
}> {
  if (books.length === 0) {
    return { books: [], blocked: [] };
  }

  const status = await getFilterStatus();
  if (!status.enabled) {
    return { books, blocked: [] };
  }

  const visibleBooks: T[] = [];
  const blocked: Array<{ book: T; keyword: string }> = [];

  for (const book of books) {
    const keyword = findBlockedKeyword(book, status.keywords);
    if (keyword) {
      blocked.push({ book, keyword });
      continue;
    }
    visibleBooks.push(book);
  }

  return { books: visibleBooks, blocked };
}

export async function assertBookVisible<T extends Book>(book: T): Promise<T> {
  const result = await filterBlockedBooks([book]);
  if (result.books.length === 0) {
    const keyword = result.blocked[0]?.keyword ?? 'content_filter';
    throw new Error(`Book hidden by content filter: ${keyword}`);
  }

  return result.books[0];
}
