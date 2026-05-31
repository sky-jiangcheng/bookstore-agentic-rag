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

type RetrievalType = 'semantic' | 'keyword' | 'popular' | 'reranker';

interface RetrievalResultItem {
  books: Book[];
  type: RetrievalType;
}

const DEFAULT_STRATEGIES: RetrievalStrategy[] = [
  { type: 'keyword', enabled: true, topK: RETRIEVAL_CONSTANTS.KEYWORD_TOP_K },
  { type: 'popular', enabled: true, topK: RETRIEVAL_CONSTANTS.POPULAR_TOP_K },
];

function createCategoryAliasMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [category, aliases] of Object.entries(RETRIEVAL_CONSTANTS.CATEGORY_ALIASES)) {
    map.set(category, aliases);
  }
  return map;
}

const CATEGORY_ALIAS_MAP = createCategoryAliasMap();

function getCategoryAliases(category: string): string[] {
  return CATEGORY_ALIAS_MAP.get(category) ?? [category];
}

function expandSearchTerms(requirement: RequirementAnalysis): string[] {
  const terms = new Set<string>(requirement.keywords);

  for (const category of requirement.categories) {
    terms.add(category);
    for (const alias of getCategoryAliases(category)) {
      terms.add(alias);
    }
  }

  if (terms.size === 0 && requirement.original_query) {
    terms.add(requirement.original_query);
  }

  return Array.from(terms).filter(Boolean);
}

function getBookText(book: Book): string {
  return `${book.title} ${book.author} ${book.category}`.toLowerCase();
}

function getBookPrimaryText(book: Book): string {
  return `${book.title} ${book.category}`.toLowerCase();
}

export function getStrongKeywords(requirement: RequirementAnalysis): string[] {
  return requirement.keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(
      (keyword) =>
        keyword.length >= RETRIEVAL_CONSTANTS.MIN_KEYWORD_LENGTH &&
        !RETRIEVAL_CONSTANTS.STOPWORDS.has(keyword),
    )
    .slice(0, RETRIEVAL_CONSTANTS.MAX_KEYWORDS);
}

function hasKeywordInText(keywords: string[], text: string): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function matchesPrimaryKeywords(book: Book, keywords: string[]): boolean {
  if (keywords.length === 0) {
    return true;
  }
  const primaryText = getBookPrimaryText(book);
  return hasKeywordInText(keywords, primaryText);
}

function matchesFullKeywords(book: Book, keywords: string[]): boolean {
  if (keywords.length === 0) {
    return true;
  }
  const fullText = getBookText(book);
  return hasKeywordInText(keywords, fullText);
}

export function hasExcludedKeywords(book: Book, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) {
    return false;
  }
  const fullText = getBookText(book);
  return excludedKeywords.some((keyword) => fullText.includes(keyword.toLowerCase()));
}

export function matchesCategories(book: Book, categories: string[]): boolean {
  if (categories.length === 0) {
    return true;
  }

  const primaryText = getBookPrimaryText(book);
  return categories.some((category) => {
    const aliases = getCategoryAliases(category);
    return aliases.some((alias) => primaryText.includes(alias.toLowerCase()));
  });
}

export function computeRelevanceScore(book: Book, requirement: RequirementAnalysis): number {
  let score = book.relevance_score ?? 0;
  const bookText = getBookText(book);
  const strongKeywords = getStrongKeywords(requirement);
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];
  const { SCORE_WEIGHTS } = RETRIEVAL_CONSTANTS;

  if (matchesCategories(book, requirement.categories)) {
    score += SCORE_WEIGHTS.CATEGORY_MATCH;
  }

  for (const keyword of strongKeywords) {
    if (bookText.includes(keyword)) {
      score += SCORE_WEIGHTS.KEYWORD_MATCH;
    }
  }

  if (strongKeywords.length > 0 && !matchesFullKeywords(book, strongKeywords)) {
    score -= SCORE_WEIGHTS.KEYWORD_MISMATCH_PENALTY;
  }

  if (hasExcludedKeywords(book, excludedKeywords)) {
    score -= SCORE_WEIGHTS.EXCLUDED_KEYWORD_PENALTY;
  }

  // Budget is a total price constraint, not per-book. Penalize expensive books
  // but don't exclude them — the recommendation agent handles the total budget limit.
  if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
    score -= SCORE_WEIGHTS.BUDGET_EXCEED_PENALTY / 2;
  }

  return score;
}

function isBookExcluded(book: Book, requirement: RequirementAnalysis): boolean {
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];

  if (hasExcludedKeywords(book, excludedKeywords)) {
    return true;
  }

  // Budget is total price, not per-book limit. Don't exclude books by price here;
  // the recommendation agent will enforce the total budget constraint.

  return false;
}

export function enforceHardConstraints(books: Book[], requirement: RequirementAnalysis): Book[] {
  const strongKeywords = getStrongKeywords(requirement);

  const filtered = books.filter((book) => {
    if (isBookExcluded(book, requirement)) {
      return false;
    }

    if (requirement.categories.length > 0 && !matchesCategories(book, requirement.categories)) {
      return false;
    }

    if (strongKeywords.length > 0 && !matchesPrimaryKeywords(book, strongKeywords)) {
      return false;
    }

    return true;
  });

  const fallbackBooks = filtered.length > 0 ? filtered : books.filter((book) => !isBookExcluded(book, requirement));
  const sorted = [...fallbackBooks].sort((a, b) => computeRelevanceScore(b, requirement) - computeRelevanceScore(a, requirement));

  return sorted;
}

async function retrieveSemantic(requirement: RequirementAnalysis, topK: number): Promise<Book[]> {
  try {
    const { vector } = generateEmbeddingPair(requirement.original_query);
    const vectorResults = await vectorSearch(vector, topK);
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

async function retrieveKeyword(requirement: RequirementAnalysis, topK: number): Promise<Book[]> {
  try {
    const searchTerms = expandSearchTerms(requirement);
    const mergedBooks = new Map<string, Book>();

    const books = await searchCatalog({
      author: requirement.constraints.author,
      price_min: requirement.constraints.price_min,
      price_max: requirement.constraints.price_max,
      query: searchTerms.join(' '),
    });

    for (const book of books) {
      if (!mergedBooks.has(book.book_id)) {
        mergedBooks.set(book.book_id, book);
      }
    }

    const limitedBooks = Array.from(mergedBooks.values()).slice(0, topK * 2);
    console.log(`[keyword] Retrieved ${limitedBooks.length} books from catalog search`);
    return limitedBooks;
  } catch (error) {
    console.error('[keyword] retrieval failed:', error);
    throw error;
  }
}

async function retrievePopular(requirement: RequirementAnalysis, topK: number): Promise<Book[]> {
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

export function applyReciprocalRankFusion(results: Book[][], k: number = RETRIEVAL_CONSTANTS.RRF_K): Book[] {
  const scores = new Map<string, number>();
  const bookMap = new Map<string, Book>();

  for (const resultList of results) {
    for (let i = 0; i < resultList.length; i++) {
      const book = resultList[i];
      const rank = i + 1;
      const bookId = book.book_id;
      const contribution = 1 / (k + rank);

      const currentScore = scores.get(bookId) ?? 0;
      scores.set(bookId, currentScore + contribution);

      if (!bookMap.has(bookId)) {
        bookMap.set(bookId, book);
      }
    }
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([bookId]) => bookMap.get(bookId) as Book);
}

function getRerankerInputLimit(totalBooks: number, rerankerConfig: RerankerConfig): number {
  return Math.min(
    rerankerConfig.topK ?? RETRIEVAL_CONSTANTS.RERANKER_MAX_INPUT,
    totalBooks,
  );
}

export async function retrieveCandidates(
  requirement: RequirementAnalysis,
  strategies: RetrievalStrategy[] = DEFAULT_STRATEGIES,
  options?: RetrievalOptions,
): Promise<RetrievalResult> {
  const retrievalPromises: Promise<RetrievalResultItem>[] = [];

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    let promise: Promise<RetrievalResultItem>;

    switch (strategy.type) {
      case 'semantic':
        promise = retrieveSemantic(requirement, strategy.topK).then((books) => ({
          books,
          type: 'semantic' as RetrievalType,
        }));
        break;

      case 'keyword':
        promise = retrieveKeyword(requirement, strategy.topK).then((books) => ({
          books,
          type: 'keyword' as RetrievalType,
        }));
        break;

      case 'popular':
        promise = retrievePopular(requirement, strategy.topK).then((books) => ({
          books,
          type: 'popular' as RetrievalType,
        }));
        break;

      default:
        continue;
    }

    retrievalPromises.push(promise);
  }

  const results = await Promise.allSettled(retrievalPromises);

  const bookLists: Book[][] = [];
  const sources: RetrievalType[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      bookLists.push(result.value.books);
      sources.push(result.value.type);
    } else {
      console.error('[retrieval] Strategy failed:', result.reason);
    }
  }

  let fusedBooks = applyReciprocalRankFusion(bookLists);
  fusedBooks = enforceHardConstraints(fusedBooks, requirement);

  if (options?.enableReranking && options.rerankerConfig) {
    try {
      const topN = getRerankerInputLimit(fusedBooks.length, options.rerankerConfig);
      const topCandidates = fusedBooks.slice(0, topN);
      const remaining = fusedBooks.slice(topN);
      const reranked = await rerankBooks(requirement.original_query, topCandidates, options.rerankerConfig);
      fusedBooks = [...reranked, ...remaining];
      sources.push('reranker');
    } catch (error) {
      console.warn('[retrieval] Reranking failed, using RRF results:', error);
    }
  }

  const hasSpecificIntent = requirement.categories.length > 0 || requirement.keywords.length > 0;
  const minRecommendations = RETRIEVAL_CONSTANTS.MIN_RECOMMENDATIONS;
  const targetCount = options?.rerankerConfig?.topK ?? requirement.constraints.target_count ?? minRecommendations;

  const finalBooks = hasSpecificIntent
    ? fusedBooks
    : fusedBooks.slice(0, Math.max(minRecommendations, targetCount));

  return {
    books: finalBooks,
    sources,
    total_candidates: finalBooks.length,
  };
}
