// lib/agents/recommendation-agent.ts
import type { Book, RecommendedBook, RecommendationResult, RequirementAnalysis } from '@/lib/types/rag';
import { filterBlockedBooks } from '@/lib/server/book-filters';

function rankForBudget(book: RecommendedBook, requirement: RequirementAnalysis): number {
  let score = book.relevance_score ?? 0;
  const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();

  for (const category of requirement.categories) {
    if (haystack.includes(category.toLowerCase())) {
      score += 1.2;
    }
  }

  for (const keyword of requirement.keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += 0.6;
    }
  }

  return score;
}

export function containsExcludedKeyword(book: RecommendedBook, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) {
    return false;
  }

  const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();
  return excludedKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function enforceBudget(
  books: RecommendedBook[],
  requirement: RequirementAnalysis
): RecommendedBook[] {
  const budget = requirement.constraints.budget;
  if (!budget || books.length === 0) {
    return books;
  }

  const affordable = books
    .filter((book) => book.price <= budget)
    .sort((a, b) => rankForBudget(b, requirement) - rankForBudget(a, requirement));

  const selected: RecommendedBook[] = [];
  let total = 0;
  for (const book of affordable) {
    if (total + book.price > budget) {
      continue;
    }
    selected.push(book);
    total += book.price;
  }

  if (selected.length > 0) {
    return selected;
  }

  const cheapest = [...books].sort((a, b) => a.price - b.price)[0];
  return cheapest ? [cheapest] : [];
}

function enforceRecommendationConstraints(
  books: RecommendedBook[],
  requirement: RequirementAnalysis,
  targetCount: number
): RecommendedBook[] {
  const excludedKeywords = requirement.constraints.exclude_keywords ?? [];
  const withoutExcluded = books.filter((book) => !containsExcludedKeyword(book, excludedKeywords));
  const budgetSafe = enforceBudget(withoutExcluded, requirement);
  return budgetSafe.slice(0, Math.max(1, targetCount));
}

export function buildHeuristicExplanation(book: Book, requirement: RequirementAnalysis): string {
  const haystack = `${book.title} ${book.category}`.toLowerCase();
  const matchedCategories = requirement.categories.filter((category) => haystack.includes(category.toLowerCase()));
  const matchedKeywords = requirement.keywords.filter((keyword) => keyword.length >= 2 && haystack.includes(keyword.toLowerCase())).slice(0, 3);
  const explanationParts: string[] = [];

  if (matchedCategories.length > 0) {
    explanationParts.push(`主题命中「${matchedCategories.join('、')}」`);
  }
  if (matchedKeywords.length > 0) {
    explanationParts.push(`关键词覆盖「${matchedKeywords.join('、')}」`);
  }
  if (requirement.constraints.budget !== undefined) {
    explanationParts.push(`单本价格 ¥${book.price.toFixed(2)}`);
  }
  if (book.description) {
    const cleanDesc = book.description.replace(/\s+/g, ' ').trim();
    explanationParts.push(`简介: ${cleanDesc.length > 60 ? cleanDesc.slice(0, 60) + '...' : cleanDesc}`);
  }

  if (explanationParts.length === 0) {
    return '这本书与当前需求主题相关，且内容完整，适合作为候选。';
  }

  return `${explanationParts.join('；')}。`;
}

export async function generateRecommendation(
  requirement: RequirementAnalysis,
  candidates: Book[],
): Promise<RecommendationResult> {
  const { books: visibleCandidates } = await filterBlockedBooks(candidates);

  // Determine target count based on requirement or default to 5
  const targetCount = Math.min(requirement.constraints.target_count ?? Math.min(5, visibleCandidates.length), visibleCandidates.length);

  // If no candidates available, return empty result
  if (visibleCandidates.length === 0) {
    return {
      books: [],
      total_price: 0,
      quality_score: 0,
      confidence: 0,
      category_distribution: {},
    };
  }

  const mappedBooks: RecommendedBook[] = visibleCandidates.map(book => ({
    ...book,
    explanation: buildHeuristicExplanation(book, requirement),
  }));

  const finalBooks = enforceRecommendationConstraints(mappedBooks, requirement, targetCount);

  // Calculate category distribution:
  const category_distribution: Record<string, number> = {};
  for (const book of finalBooks) {
    category_distribution[book.category] = (category_distribution[book.category] || 0) + 1;
  }

  // Calculate total price:
  const total_price = finalBooks.reduce((sum, book) => sum + book.price, 0);

  // Coverage ratio: proportion of visible candidates that made it into the final selection
  const coverage_score = finalBooks.length / visibleCandidates.length;

  // Calculate confidence: based on how clear the requirement is
  const clarityScore = Math.min(1, (
    (requirement.categories.length + requirement.keywords.length + requirement.preferences.length) / 6
  ));
  const confidence = requirement.needs_clarification
    ? 0.3 + clarityScore * 0.2  // Lower base confidence when clarification needed
    : 0.5 + clarityScore * 0.5;

  return {
    books: finalBooks,
    total_price,
    quality_score: coverage_score,
    confidence,
    category_distribution,
  };
}
