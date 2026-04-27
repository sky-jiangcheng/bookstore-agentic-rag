// lib/agents/retrieval-agent.ts
import type { Book, RetrievalResult, RequirementAnalysis } from '@/lib/types/rag';
import { vectorSearch } from '@/lib/upstash';
import { searchCatalog, getPopularBooks, getBookDetails } from '@/lib/clients/catalog-client';
import { generateEmbeddingPair } from '@/lib/embeddings';
import { rerankBooks, type RerankerConfig } from '@/lib/reranking';

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

const CATEGORY_ALIASES: Record<string, string[]> = {
  历史: ['历史', '党史', '地方史', '人物传记', '地方文化', '革命', '传记'],
  计算机: ['计算机', '编程', '算法', '人工智能', '软件', '开发', 'python', 'java'],
  教育: ['教育', '教材', '教辅', '学习'],
  文学: ['文学', '小说', '散文', '诗歌'],
  旅游: ['旅游', '旅行', '城市', '地理'],
  科普: ['科普', '科学', '物理', '化学', '生物'],
  艺术: ['艺术', '美术', '设计', '摄影', '音乐'],
  少儿: ['少儿', '儿童', '绘本', '亲子'],
  金融: ['金融', '投资', '理财', '财务'],
  成长: ['职场', '沟通', '思维', '写作', '演讲'],
  哲学: ['哲学', '思想', '伦理'],
};

const KEYWORD_STOPWORDS = new Set(['推荐', '书', '书籍', '书单', '适合', '相关', '一个', '一些', '用户']);

function expandSearchTerms(requirement: RequirementAnalysis): string[] {
  const terms = new Set<string>(requirement.keywords);

  for (const category of requirement.categories) {
    terms.add(category);
    for (const alias of CATEGORY_ALIASES[category] ?? []) {
      terms.add(alias);
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
    .filter((keyword) => keyword.length >= 2 && !KEYWORD_STOPWORDS.has(keyword))
    .slice(0, 18);
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
    const aliasSet = CATEGORY_ALIASES[category] ?? [category];
    return aliasSet.some((alias) => primaryHaystack.includes(alias.toLowerCase()));
  });
}

function computeRelevanceBoost(book: Book, requirement: RequirementAnalysis): number {
  let score = book.relevance_score ?? 0;
  const haystack = getBookText(book);
  const strongKeywords = getStrongKeywords(requirement);
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];

  if (matchesRequestedCategories(book, requirement.categories)) {
    score += 2;
  }

  for (const keyword of strongKeywords) {
    if (haystack.includes(keyword)) {
      score += 0.8;
    }
  }

  if (strongKeywords.length > 0 && !hasKeywordMatch(book, strongKeywords)) {
    score -= 2;
  }

  if (hasExcludedKeyword(book, excludedKeywords)) {
    score -= 8;
  }

  if (requirement.constraints.budget && book.price > requirement.constraints.budget) {
    score -= 5;
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

export async function retrieveCandidates(
  requirement: RequirementAnalysis,
  strategies: RetrievalStrategy[] = [
    { type: 'semantic', enabled: true, topK: 10 },
    { type: 'keyword', enabled: true, topK: 10 },
    { type: 'popular', enabled: true, topK: 10 },
  ],
  options?: RetrievalOptions,
): Promise<RetrievalResult> {
  // Collect all enabled retrieval promises
  const retrievalPromises: Promise<{ books: Book[]; type: 'semantic' | 'keyword' | 'popular' }>[] = [];

  for (const strategy of strategies) {
    if (!strategy.enabled) continue;

    switch (strategy.type) {
      case 'semantic':
        retrievalPromises.push(
          (async () => {
            try {
              const { vector, sparseVector } = generateEmbeddingPair(requirement.original_query);
              const vectorResults = await vectorSearch(vector, strategy.topK, sparseVector);
              // Convert vector results to Book objects by fetching details
              // Handle each getBookDetails call independently to avoid single failure breaking all
              const bookPromises = vectorResults.map(async (result) => {
                try {
                  const book = await getBookDetails(result.id);
                  return book;
                } catch (error) {
                  console.warn(`[semantic] Failed to get book details for ${result.id}:`, error);
                  return null;
                }
              });
              const booksOrNull = await Promise.all(bookPromises);
              // Filter out null results (failed fetches)
              const books = booksOrNull.filter((book): book is Book => book !== null);
              return { books, type: 'semantic' };
            } catch (error) {
              console.warn('[semantic] retrieval failed:', error);
              return { books: [], type: 'semantic' };
            }
          })()
        );
        break;

      case 'keyword':
        retrievalPromises.push(
          (async () => {
            try {
              const searchTerms = expandSearchTerms(requirement);
              const merged = new Map<string, Book>();

              for (const term of searchTerms) {
                const books = await searchCatalog({
                  author: requirement.constraints.author,
                  price_min: requirement.constraints.price_min,
                  price_max: requirement.constraints.price_max,
                  query: term,
                });

                for (const book of books) {
                  if (!merged.has(book.book_id)) {
                    merged.set(book.book_id, book);
                  }
                }
              }

              // Limit to topK
              const limitedBooks = Array.from(merged.values()).slice(0, strategy.topK * 2);
              return { books: limitedBooks, type: 'keyword' };
            } catch (error) {
              console.warn('[keyword] retrieval failed:', error);
              return { books: [], type: 'keyword' };
            }
          })()
        );
        break;

      case 'popular':
        retrievalPromises.push(
          (async () => {
            try {
              if (requirement.categories.length > 0 || requirement.keywords.length > 0) {
                return { books: [], type: 'popular' };
              }
              const books = await getPopularBooks(strategy.topK);
              return { books, type: 'popular' };
            } catch (error) {
              console.warn('[popular] retrieval failed:', error);
              return { books: [], type: 'popular' };
            }
          })()
        );
        break;
    }
  }

  // Wait for all retrievals to complete in parallel
  const results = await Promise.all(retrievalPromises);

  // Extract just the book lists for RRF
  const bookLists: Book[][] = results.map(r => r.books);
  const sources = results.map(r => r.type);

  // Apply RRF fusion
  let fusedBooks = reciprocalRankFusion(bookLists);
  fusedBooks = enforceHardConstraints(fusedBooks, requirement);

  // Apply reranking if enabled (Classic RAG component)
  if (options?.enableReranking && options.rerankerConfig) {
    const rerankerTopK = options.enableRerankingOnTopK || Math.min(50, fusedBooks.length);

    if (fusedBooks.length > rerankerTopK) {
      // Rerank top N candidates
      const topCandidates = fusedBooks.slice(0, rerankerTopK);
      const remainingBooks = fusedBooks.slice(rerankerTopK);

      try {
        const reranked = await rerankBooks(
          requirement.original_query,
          topCandidates,
          options.rerankerConfig
        );

        // Combine reranked results with remaining books
        fusedBooks = [...reranked, ...remainingBooks];
      } catch (error) {
        console.warn('[retrieval] Reranking failed, using RRF results:', error);
        // Continue with RRF results if reranking fails
      }
    } else {
      // Rerank all results if we have fewer than topK
      try {
        fusedBooks = await rerankBooks(
          requirement.original_query,
          fusedBooks,
          options.rerankerConfig
        );
      } catch (error) {
        console.warn('[retrieval] Reranking failed, using RRF results:', error);
      }
    }
  }

  const hasSpecificIntent = requirement.categories.length > 0 || requirement.keywords.length > 0;
  const finalBooks = hasSpecificIntent
    ? fusedBooks
    : fusedBooks.slice(0, Math.max(5, requirement.constraints.target_count ?? 5));

  return {
    books: finalBooks,
    sources: [...sources, ...(options?.enableReranking ? ['reranker' as const] : [])],
    total_candidates: finalBooks.length,
  };
}

// RRF 融合算法
function reciprocalRankFusion(
  results: Book[][],
  k: number = 60,
): Book[] {
  const scores = new Map<string, number>();
  const bookMap = new Map<string, Book>();

  // Process each result list
  for (const resultList of results) {
    // rank starts from 1 as per RRF algorithm
    for (let i = 0; i < resultList.length; i++) {
      const book = resultList[i];
      const rank = i + 1;
      const bookId = book.book_id;
      const score = 1 / (k + rank);

      // Accumulate score
      const currentScore = scores.get(bookId) || 0;
      scores.set(bookId, currentScore + score);

      // Store book reference
      if (!bookMap.has(bookId)) {
        bookMap.set(bookId, book);
      }
    }
  }

  // Deduplicate and sort by score descending
  return deduplicateAndMerge(scores, bookMap);
}

// 去重: 按 bookId 去重，保留最高分
function deduplicateAndMerge(scores: Map<string, number>, bookMap: Map<string, Book>): Book[] {
  // Convert to array of [bookId, score]
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([bookId]) => bookMap.has(bookId))
    .map(([bookId]) => bookMap.get(bookId) as Book);
}
