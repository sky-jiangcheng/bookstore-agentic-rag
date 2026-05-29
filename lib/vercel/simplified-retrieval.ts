/**
 * Vercel-Optimized Retrieval Agent
 *
 * Simplified retrieval for serverless execution within time limits.
 * Removes complex multi-path retrieval and reranking.
 */

import { generateEmbeddingPair } from '@/lib/embeddings';
import { searchCatalog } from '@/lib/clients/catalog-client';
import { vectorSearchDirect, upsertBookVector } from '@/lib/vector-service';
import type { Book, RequirementAnalysis, RetrievalResult } from '@/lib/types/rag';
import { filterBlockedBooks } from '@/lib/server/book-filters';
import { ensureVectorStoreReady } from '@/lib/vector-initializer';

const CATEGORY_EXPANSION_MAP: Record<string, string[]> = {
  '公共管理': ['公共管理', '行政管理', '公共', '行政'],
  '政治学': ['政治学', '政治', '公共管理', '行政管理'],
  '经济学': ['经济学', '经济'],
  '社会学': ['社会学', '社会'],
  '法学': ['法学', '法律', '行政法', '宪法', '民法', '刑法'],
  '哲学': ['哲学', '哲思'],
  '历史': ['历史', '史学', '传记', '人物'],
  '心理学': ['心理学', '心理'],
  '教育学': ['教育学', '教育'],
  '文学': ['文学', '文艺'],
  '管理学': ['管理学', '管理'],
  '计算机': ['计算机', '计算机科学', '编程'],
  '法律': ['法律', '法学', '行政法', '诉讼法', '宪法'],
  '成长励志': ['成长', '励志', '职场', '成功'],
  '职场实务': ['职场', '办公', '实务', '职业', '办公室'],
  '少儿': ['少儿', '儿童', '绘本', '亲子'],
  '金融': ['金融', '投资', '理财', '财务'],
  '旅游': ['旅游', '旅行', '城市', '地理', '人文'],
};

const MIN_KEYWORD_LENGTH = 2;
const RELEVANCE_THRESHOLD = 0.01;

function expandCategories(categories: string[]): string[] {
  const expanded = new Set<string>(categories);
  for (const cat of categories) {
    const synonyms = CATEGORY_EXPANSION_MAP[cat];
    if (synonyms) {
      synonyms.forEach(s => expanded.add(s));
    }
  }
  return Array.from(expanded);
}

function isExcludedByKeyword(haystack: string, excludedKeywords: string[]): boolean {
  const lowerHaystack = haystack.toLowerCase();
  return excludedKeywords.some(keyword => lowerHaystack.includes(keyword.toLowerCase()));
}

function applyHardConstraints(books: Book[], requirement: RequirementAnalysis): Book[] {
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];
  const keywords = requirement.keywords
    .map(k => k.toLowerCase())
    .filter(k => k.length >= MIN_KEYWORD_LENGTH);

  // 给书打分，带有关键词匹配的优先
  const scoredBooks = books.map(book => {
    const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();
    let score = 0;
    let pass = true;

    if (isExcludedByKeyword(haystack, excludedKeywords)) {
      pass = false;
    }

    if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
      // 预算超了但还是保留，只是分数低一些
      score -= 0.5;
    }

    // 关键词匹配加分
    if (keywords.length > 0) {
      let matchCount = 0;
      keywords.forEach(keyword => {
        if (haystack.includes(keyword)) {
          matchCount++;
        }
      });
      if (matchCount > 0) {
        score += matchCount * 0.3;
      }
    }

    return {
      book,
      score,
      pass
    };
  });

  // 先按 score 降序，然后按 pass，然后按 relevance_score
  scoredBooks.sort((a, b) => {
    if (a.pass !== b.pass) {
      return a.pass ? -1 : 1; // 通过的排前面
    }
    if (a.score !== b.score) {
      return b.score - a.score; // 分数高的排前面
    }
    return b.book.relevance_score - a.book.relevance_score; // 最后按 relevance_score
  });

  return scoredBooks.map(sb => sb.book);
}

function rankBooksByRelevance(books: Book[], queryKeywords: string[]): Book[] {
  return [...books].sort((a, b) => {
    const relevanceDiff = b.relevance_score - a.relevance_score;
    if (Math.abs(relevanceDiff) > RELEVANCE_THRESHOLD) {
      return relevanceDiff;
    }

    if (queryKeywords.length > 0) {
      const aMatches = queryKeywords.some(kw =>
        a.title.toLowerCase().includes(kw) || a.category.toLowerCase().includes(kw)
      );
      const bMatches = queryKeywords.some(kw =>
        b.title.toLowerCase().includes(kw) || b.category.toLowerCase().includes(kw)
      );

      if (aMatches !== bMatches) {
        return aMatches ? -1 : 1;
      }
    }

    return (b.popularity_score ?? 0) - (a.popularity_score ?? 0);
  });
}

async function performVectorSearch(
  requirement: RequirementAnalysis,
  topK: number
): Promise<Book[]> {
  const { vector } = generateEmbeddingPair(requirement.original_query);
  const expandedCategories = expandCategories(requirement.categories);

  return vectorSearchDirect(vector, topK, {
    categories: expandedCategories.length > 0 ? expandedCategories : undefined,
    maxPrice: requirement.constraints.budget,
    queryText: requirement.original_query,
  });
}

async function performKeywordSearch(
  requirement: RequirementAnalysis,
  existingIds: Set<string>,
  maxResults: number
): Promise<Book[]> {
  const expandedCategories = expandCategories(requirement.categories);
  const filters = {
    categories: expandedCategories.length > 0 ? expandedCategories : undefined,
    author: requirement.constraints.author,
    query: requirement.keywords.slice(0, 3).join(' '),
  };

  const keywordResults = await searchCatalog(filters);
  return keywordResults
    .filter(book => !existingIds.has(book.book_id))
    .slice(0, maxResults);
}

async function getPopularFallback(topK: number): Promise<Book[]> {
  const { getPopularBooks } = await import('@/lib/clients/catalog-client');
  return getPopularBooks(Math.min(5, topK));
}

export async function retrieveCandidatesVercel(
  requirement: RequirementAnalysis,
  options: { topK?: number; enableKeyword?: boolean } = {}
): Promise<RetrievalResult> {
  const { topK = 10, enableKeyword = true } = options;

  ensureVectorStoreReady().then(triggered => {
    if (triggered) {
      console.log('[retrieval] Background pre-computation triggered');
    }
  });

  const results: Book[] = [];
  const sources: ('semantic' | 'keyword' | 'popular')[] = [];

  try {
    const books = await performVectorSearch(requirement, topK);
    results.push(...books);
    sources.push('semantic');
  } catch (error) {
    console.warn('[retrieval] Vector search failed:', error);
  }

  if (enableKeyword && results.length < topK) {
    try {
      const existingIds = new Set(results.map(b => b.book_id));
      const keywordBooks = await performKeywordSearch(requirement, existingIds, topK - results.length);
      results.push(...keywordBooks);
      sources.push('keyword');
    } catch (error) {
      console.warn('[retrieval] Keyword search failed:', error);
    }
  }

  if (results.length === 0) {
    try {
      const popularBooks = await getPopularFallback(topK);
      results.push(...popularBooks);
      sources.push('popular');
    } catch (error) {
      console.warn('[retrieval] Popular fallback failed:', error);
    }
  }

  const filteredResults = await filterBlockedBooks(results);
  const constrained = applyHardConstraints(filteredResults.books, requirement);
  const queryKeywords = requirement.keywords.map(k => k.toLowerCase());
  const sorted = rankBooksByRelevance(constrained, queryKeywords);

  return {
    books: sorted.slice(0, topK),
    sources,
    total_candidates: sorted.length,
  };
}

export async function fastRetrieval(
  query: string,
  topK: number = 100
): Promise<Book[]> {
  try {
    const { vector } = generateEmbeddingPair(query);
    const books = await vectorSearchDirect(vector, topK);
    const filtered = (await filterBlockedBooks(books)).books;

    return filtered.sort((a, b) => {
      const relevanceDiff = b.relevance_score - a.relevance_score;
      if (Math.abs(relevanceDiff) > RELEVANCE_THRESHOLD) {
        return relevanceDiff;
      }
      return (b.popularity_score ?? 0) - (a.popularity_score ?? 0);
    });
  } catch (error) {
    console.error('[fastRetrieval] Failed:', error);
    return [];
  }
}

export async function precomputeEmbeddings(): Promise<void> {
  console.log('[precompute] Starting embedding pre-computation...');

  try {
    const { sql } = await import('@vercel/postgres');
    const result = await sql`
      SELECT id, title, author, category
      FROM books
      LIMIT 500
    `;

    let computed = 0;
    for (const row of result.rows) {
      try {
        const bookId = String(row.id);
        const title = row.title as string;
        const author = row.author as string;
        const category = row.category as string;
        const text = `Title: ${title}\nAuthor: ${author}\nCategory: ${category}`;
        const { vector } = generateEmbeddingPair(text);

        await upsertBookVector(
          bookId,
          vector,
          { bookId, title, author, category, description: '' },
        );

        computed++;
      } catch (error) {
        console.warn(`[precompute] Failed for book ${row.id}:`, error);
      }
    }

    console.log(`[precompute] Completed: ${computed} embeddings`);
  } catch (error) {
    console.error('[precompute] Failed:', error);
  }
}
