// lib/agents/retrieval-agent.ts
import type { Book, RetrievalResult, RequirementAnalysis } from '@/lib/types/rag';
import { searchCatalog, getPopularBooks } from '@/lib/clients/catalog-service';
import { RETRIEVAL_CONSTANTS } from '@/lib/constants';

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

async function retrieveKeyword(requirement: RequirementAnalysis, topK: number): Promise<Book[]> {
  try {
    const searchTerms =
      requirement.expanded_search_terms?.length > 0
        ? requirement.expanded_search_terms
        : expandSearchTerms(requirement);

    const mergedBooks = new Map<string, Book>();

    const books = await searchCatalog({
      author: requirement.constraints.author,
      price_min: requirement.constraints.price_min,
      price_max: requirement.constraints.price_max,
      query: requirement.original_query,
      search_terms: searchTerms,
      limit: topK * 2,
      requirement,
    });

    for (const book of books) {
      if (!mergedBooks.has(book.book_id)) {
        mergedBooks.set(book.book_id, book);
      }
    }

    const limitedBooks = Array.from(mergedBooks.values()).slice(0, topK * 2);
    console.log(`[keyword] Retrieved ${limitedBooks.length} books from catalog search (terms: ${searchTerms.length})`);
    return limitedBooks;
  } catch (error) {
    console.error('[keyword] retrieval failed:', error);
    throw error;
  }
}

async function retrievePopular(topK: number): Promise<Book[]> {
  try {
    const books = await getPopularBooks(topK);
    console.log(`[popular] Retrieved ${books.length} popular books`);
    return books;
  } catch (error) {
    console.error('[popular] retrieval failed:', error);
    throw error;
  }
}

function generatePseudoSql(
  requirement: RequirementAnalysis,
  searchTerms: string[],
  hasSpecificIntent: boolean,
  limitNum: number
): string {
  if (!hasSpecificIntent) {
    return `SELECT id, title, author, price, category, description, popularity_score
FROM books
ORDER BY popularity_score DESC, updated_at DESC
LIMIT ${limitNum};`;
  }

  const termsClause = searchTerms
    .map((term) => `(title || ' ' || author || ' ' || category || ' ' || description) ILIKE '%${term}%'`)
    .join('\n     OR ');

  const categoriesClause = requirement.categories.length > 0
    ? `\n  AND category IN (${requirement.categories.map((c) => `'${c}'`).join(', ')})`
    : '';

  const priceMaxClause = requirement.constraints.price_max !== undefined
    ? `\n  AND price <= ${requirement.constraints.price_max}`
    : '';

  const priceMinClause = requirement.constraints.price_min !== undefined
    ? `\n  AND price >= ${requirement.constraints.price_min}`
    : '';

  const authorClause = requirement.constraints.author
    ? `\n  AND author ILIKE '%${requirement.constraints.author}%'`
    : '';

  const excludeClause = requirement.constraints.exclude_keywords?.length
    ? `\n  -- 排除项过滤\n  AND NOT (\n    ${requirement.constraints.exclude_keywords
        .map((k) => `(title || ' ' || author || ' ' || category || ' ' || description) ILIKE '%${k}%'`)
        .join('\n     OR ')}\n  )`
    : '';

  return `SELECT id, title, author, price, category, description, popularity_score
FROM books
WHERE (
     ${termsClause || '1=1'}
)${categoriesClause}${priceMinClause}${priceMaxClause}${authorClause}${excludeClause}
ORDER BY popularity_score DESC, updated_at DESC
LIMIT ${limitNum};`;
}

export async function retrieveCandidates(
  requirement: RequirementAnalysis,
  topK: number = 30,
): Promise<RetrievalResult> {
  const hasSpecificIntent = requirement.categories.length > 0 || requirement.keywords.length > 0;

  const searchTerms =
    requirement.expanded_search_terms?.length > 0
      ? requirement.expanded_search_terms
      : expandSearchTerms(requirement);

  let books = hasSpecificIntent
    ? await retrieveKeyword(requirement, topK)
    : await retrievePopular(topK);
  let source: RetrievalResult['sources'][number] = hasSpecificIntent ? 'keyword' : 'popular';

  if (hasSpecificIntent && books.length === 0) {
    books = await retrievePopular(topK);
    source = 'popular-fallback';
    console.warn('[retrieval] Keyword search returned no books; using popular fallback');
  }

  const finalBooks = enforceHardConstraints(books, requirement);
  const sqlString = generatePseudoSql(requirement, searchTerms, hasSpecificIntent, topK * 2);

  return {
    books: finalBooks,
    sources: [source],
    total_candidates: finalBooks.length,
    sql: sqlString,
  };
}
