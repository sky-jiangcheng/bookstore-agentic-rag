// lib/agents/retrieval-agent.ts
import type { Book, RetrievalResult, RequirementAnalysis } from '@/lib/types/rag';
import { vectorSearch } from '@/lib/vector-service';
import { searchCatalog, getPopularBooks, getBookDetailsBatch } from '@/lib/clients/catalog-client';
import { generateEmbeddingPair } from '@/lib/embeddings';
import { rerankBooks, type RerankerConfig } from '@/lib/reranking';
import { RETRIEVAL_CONSTANTS } from '@/lib/constants';

export interface RetrievalStrategy {
  type: 'semantic' | 'keyword' | 'popular';
  enabled: boolean;
  topK: number;
}

export interface RetrievalOptions {
  enableReranking?: boolean;
  rerankerConfig?: RerankerConfig;
  enableRerankingOnTopK?: number;
}

function expandSearchTerms(requirement: RequirementAnalysis): string[] {
  const terms = new Set<string>(requirement.keywords);

  for (const category of requirement.categories) {
    terms.add(category);
    const aliases = RETRIEVAL_CONSTANTS.CATEGORY_ALIASES[category];
    if (aliases) {
      for (const alias of aliases) {
        terms.add(alias);
      }
    }
  }

  if (terms.size === 0) {
    terms.add(requirement.original_query);
  }

  return Array.from(terms).filter(Boolean);
}

function getBookText(book: Book): string {
  return `${book.title} ${book.author} ${book.category}`.toLowerCase();
}

function getPrimaryBookText(book: Book): string {
  return `${book.title} ${book.category}`.toLowerCase();
}

function getStrongKeywords(requirement: RequirementAnalysis): string[] {
  return requirement.keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(
      (keyword) =>
        keyword.length >= RETRIEVAL_CONSTANTS.MIN_KEYWORD_LENGTH &&
        !RETRIEVAL_CONSTANTS.STOPWORDS.has(keyword),
    )
    .slice(0, RETRIEVAL_CONSTANTS.MAX_KEYWORDS);
}

function hasKeywordMatch(book: Book, keywords: string[]): boolean {
  if (keywords.length === 0) {
    return true;
  }

  const primary = getPrimaryBookText(book);
  if (keywords.some((keyword) => primary.includes(keyword))) {
    return true;
  }

  const full = getBookText(book);
  return keywords.some((keyword) => full.includes(keyword));
}

function hasExcludedKeyword(book: Book, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) {
    return false;
  }

  const full = getBookText(book);
  return excludedKeywords.some((keyword) => full.includes(keyword.toLowerCase()));
}

function matchesRequestedCategories(book: Book, categories: string[]): boolean {
  if (categories.length === 0) {
    return true;
  }

  const primaryHaystack = `${book.title} ${book.category}`.toLowerCase();
  return categories.some((category) => {
    const aliases = RETRIEVAL_CONSTANTS.CATEGORY_ALIASES[category];
    const aliasSet = aliases ?? [category];
    return aliasSet.some((alias: string) => primaryHaystack.includes(alias.toLowerCase()));
  });
}

function computeRelevanceBoost(book: Book, requirement: RequirementAnalysis): number {
  let score = book.relevance_score ?? 0;
  const haystack = getBookText(book);
  const strongKeywords = getStrongKeywords(requirement);
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];

  const { SCORE_WEIGHTS } = RETRIEVAL_CONSTANTS;

  if (matchesRequestedCategories(book, requirement.categories)) {
    score += SCORE_WEIGHTS.CATEGORY_MATCH;
  }

  for (const keyword of strongKeywords) {
    if (haystack.includes(keyword)) {
      score += SCORE_WEIGHTS.KEYWORD_MATCH;
    }
  }

  if (strongKeywords.length > 0 && !hasKeywordMatch(book, strongKeywords)) {
    score -= SCORE_WEIGHTS.KEYWORD_MISMATCH_PENALTY;
  }

  if (hasExcludedKeyword(book, excludedKeywords)) {
    score -= SCORE_WEIGHTS.EXCLUDED_KEYWORD_PENALTY;
  }

  if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
    score -= SCORE_WEIGHTS.BUDGET_EXCEED_PENALTY;
  }

  return score;
}

function enforceHardConstraints(books: Book[], requirement: RequirementAnalysis): Book[] {
  const strongKeywords = getStrongKeywords(requirement);
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];

  const filtered = books.filter((book) => {
    if (hasExcludedKeyword(book, excludedKeywords)) {
      return false;
    }

    if (requirement.categories.length > 0 && !matchesRequestedCategories(book, requirement.categories)) {
      return false;
    }

    if (strongKeywords.length > 0 && !hasKeywordMatch(book, strongKeywords)) {
      return false;
    }

    if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
      return false;
    }

    return true;
  });

  const ranked = filtered.length > 0 ? filtered : books.filter((book) => {
    if (hasExcludedKeyword(book, excludedKeywords)) {
      return false;
    }
    if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
      return false;
    }
    return true;
  });

  return [...ranked].sort((a, b) => computeRelevanceBoost(b, requirement) - computeRelevanceBoost(a, requirement));
}

/**
 * 执行语义检索
 */
async function retrieveSemantic(
  requirement: RequirementAnalysis,
  topK: number,
): Promise<Book[]> {
  try {
    const { vector, sparseVector } = generateEmbeddingPair(requirement.original_query);
    const vectorResults = await vectorSearch(vector, topK, sparseVector);
    const ids = vectorResults.map((result) => result.id);

    if (ids.length === 0) {
      return [];
    }

    let bookMap = new Map<string, Book>();
    try {
      const books = await getBookDetailsBatch(ids);
      bookMap = new Map(books.map((book) => [book.book_id, book]));
    } catch (error) {
      console.error('[semantic] Failed to batch get book details:', error);
    }

    const books = vectorResults
      .map((result) => bookMap.get(result.id) ?? null)
      .filter((book): book is Book => book !== null);

    console.log(`[semantic] Retrieved ${books.length} books from vector search`);
    return books;
  } catch (error) {
    console.error('[semantic] retrieval failed:', error);
    throw error;
  }
}

/**
 * 执行关键词检索
 */
async function retrieveKeyword(
  requirement: RequirementAnalysis,
  topK: number,
): Promise<Book[]> {
  try {
    const searchTerms = expandSearchTerms(requirement);
    const merged = new Map<string, Book>();

    const books = await searchCatalog({
      author: requirement.constraints.author,
      price_min: requirement.constraints.price_min,
      price_max: requirement.constraints.price_max,
      query: searchTerms.join(' '),
    });

    for (const book of books) {
      if (!merged.has(book.book_id)) {
        merged.set(book.book_id, book);
      }
    }

    const limitedBooks = Array.from(merged.values()).slice(0, topK * 2);
    console.log(`[keyword] Retrieved ${limitedBooks.length} books from catalog search`);
    return limitedBooks;
  } catch (error) {
    console.error('[keyword] retrieval failed:', error);
    throw error;
  }
}

/**
 * 执行热门书籍检索
 */
async function retrievePopular(
  requirement: RequirementAnalysis,
  topK: number,
): Promise<Book[]> {
  try {
    if (requirement.categories.length > 0 || requirement.keywords.length > 0) {
      return [];
    }

    const books = await getPopularBooks(topK);
    console.log(`[popular] Retrieved ${books.length} popular books`);
    return books;
  } catch (error) {
    console.error('[popular] retrieval failed:', error);
    throw error;
  }
}

/**
 * 互惠排名融合算法
 * @param results 各检索策略返回的书籍列表
 * @param k 融合参数，默认60
 */
function reciprocalRankFusion(
  results: Book[][],
  k: number = RETRIEVAL_CONSTANTS.RRF_K,
): Book[] {
  const scores = new Map<string, number>();
  const bookMap = new Map<string, Book>();

  for (const resultList of results) {
    for (let i = 0; i < resultList.length; i++) {
      const book = resultList[i];
      const rank = i + 1;
      const bookId = book.book_id;
      const score = 1 / (k + rank);

      const currentScore = scores.get(bookId) || 0;
      scores.set(bookId, currentScore + score);

      if (!bookMap.has(bookId)) {
        bookMap.set(bookId, book);
      }
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([bookId]) => bookMap.has(bookId))
    .map(([bookId]) => bookMap.get(bookId) as Book);
}

export async function retrieveCandidates(
  requirement: RequirementAnalysis,
  strategies: RetrievalStrategy[] = [
    { type: 'semantic', enabled: true, topK: RETRIEVAL_CONSTANTS.SEMANTIC_TOP_K },
    { type: 'keyword', enabled: true, topK: RETRIEVAL_CONSTANTS.KEYWORD_TOP_K },
    { type: 'popular', enabled: true, topK: RETRIEVAL_CONSTANTS.POPULAR_TOP_K },
  ],
  options?: RetrievalOptions,
): Promise<RetrievalResult> {
  const retrievalPromises: Promise<{ books: Book[]; type: 'semantic' | 'keyword' | 'popular' }>[] = [];

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    switch (strategy.type) {
      case 'semantic':
        retrievalPromises.push(
          retrieveSemantic(requirement, strategy.topK).then((books) => ({
            books,
            type: 'semantic' as const,
          })),
        );
        break;

      case 'keyword':
        retrievalPromises.push(
          retrieveKeyword(requirement, strategy.topK).then((books) => ({
            books,
            type: 'keyword' as const,
          })),
        );
        break;

      case 'popular':
        retrievalPromises.push(
          retrievePopular(requirement, strategy.topK).then((books) => ({
            books,
            type: 'popular' as const,
          })),
        );
        break;
    }
  }

  const results = await Promise.allSettled(retrievalPromises);

  const bookLists: Book[][] = [];
  const sources: ('semantic' | 'keyword' | 'popular' | 'reranker')[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      bookLists.push(result.value.books);
      sources.push(result.value.type);
    } else {
      console.error('[retrieval] Strategy failed:', result.reason);
    }
  }

  let fusedBooks = reciprocalRankFusion(bookLists);
  fusedBooks = enforceHardConstraints(fusedBooks, requirement);

  if (options?.enableReranking && options.rerankerConfig) {
    const rerankerTopK = options.enableRerankingOnTopK || Math.min(
      RETRIEVAL_CONSTANTS.RERANKER_MAX_INPUT,
      fusedBooks.length,
    );

    if (fusedBooks.length > rerankerTopK) {
      const topCandidates = fusedBooks.slice(0, rerankerTopK);
      const remainingBooks = fusedBooks.slice(rerankerTopK);

      try {
        const reranked = await rerankBooks(
          requirement.original_query,
          topCandidates,
          options.rerankerConfig,
        );
        fusedBooks = [...reranked, ...remainingBooks];
        sources.push('reranker');
      } catch (error) {
        console.warn('[retrieval] Reranking failed, using RRF results:', error);
      }
    } else {
      try {
        fusedBooks = await rerankBooks(
          requirement.original_query,
          fusedBooks,
          options.rerankerConfig,
        );
        sources.push('reranker');
      } catch (error) {
        console.warn('[retrieval] Reranking failed, using RRF results:', error);
      }
    }
  }

  const hasSpecificIntent = requirement.categories.length > 0 || requirement.keywords.length > 0;
  const finalBooks = hasSpecificIntent
    ? fusedBooks
    : fusedBooks.slice(0, Math.max(RETRIEVAL_CONSTANTS.MIN_RECOMMENDATIONS, requirement.constraints.target_count ?? RETRIEVAL_CONSTANTS.MIN_RECOMMENDATIONS));

  return {
    books: finalBooks,
    sources,
    total_candidates: finalBooks.length,
  };
}