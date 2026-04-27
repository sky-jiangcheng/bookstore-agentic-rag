// lib/agents/recommendation-agent.ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

import type { Book, RecommendedBook, RecommendationResult, RequirementAnalysis } from '@/lib/types/rag';
import { filterBlockedBooks } from '@/lib/server/book-filters';

const RecommendationSchema = z.object({
  books: z.array(z.object({
    book_id: z.string(),
    explanation: z.string(),
  })),
});

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

function containsExcludedKeyword(book: RecommendedBook, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) {
    return false;
  }

  const haystack = `${book.title} ${book.author} ${book.category}`.toLowerCase();
  return excludedKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function enforceBudget(
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

  const cheapest = affordable.sort((a, b) => a.price - b.price)[0];
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

function buildHeuristicExplanation(book: Book, requirement: RequirementAnalysis): string {
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

  if (explanationParts.length === 0) {
    return '这本书与当前需求主题相关，且内容完整，适合作为候选。';
  }

  return `${explanationParts.join('；')}。`;
}

// Extract prompt as constant to avoid recreation on each call
const RECOMMENDATION_PROMPT = (
  requirement: RequirementAnalysis,
  candidates: Book[],
  targetCount: number,
) => `你是书店智能推荐系统的推荐生成专家。

用户需求分析：
- 原始查询: ${requirement.original_query}
- 识别分类: ${JSON.stringify(requirement.categories)}
- 关键词: ${JSON.stringify(requirement.keywords)}
- 约束条件: ${JSON.stringify(requirement.constraints)}
${requirement.constraints.budget ? `- 预算总价上限: ¥${requirement.constraints.budget}，推荐总价不能超过这个限额\n` : ''}
- 用户偏好: ${JSON.stringify(requirement.preferences)}

以下是经过检索得到的候选书籍，请从中选择 ${targetCount} 本书推荐给用户：

${candidates.map((b, i) => `${i + 1}. ${b.title} by ${b.author}, ${b.category}, ¥${b.price}`).join('\n\n')}

请为用户生成个性化推荐：
1. 选择 ${targetCount} 本最符合用户需求的书籍
2. 为每本书写一段推荐理由（2-3句话，说明为什么适合用户需求）
3. 注意价格不要超过用户预算约束（如果有预算限制）

以JSON格式输出。`;

export async function generateRecommendation(
  requirement: RequirementAnalysis,
  candidates: Book[],
): Promise<RecommendationResult> {
  const { books: visibleCandidates } = await filterBlockedBooks(candidates);

  // Determine target count based on requirement or default to 5
  const targetCount = requirement.constraints.target_count ?? Math.min(5, visibleCandidates.length);

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

  try {
    const { output } = await generateText({
      model: 'google/gemini-3.1-flash',
      prompt: RECOMMENDATION_PROMPT(requirement, visibleCandidates, targetCount),
      output: Output.object({
        schema: RecommendationSchema,
      }),
    });

    // Map the recommended book IDs back to full book objects and add explanations:
    const recommendedBooks: RecommendedBook[] = output.books
      .map(({ book_id, explanation }) => {
        const originalBook = visibleCandidates.find(b => b.book_id === book_id);
        if (!originalBook) return null;
        return {
          ...originalBook,
          explanation,
        };
      })
      .filter((book): book is RecommendedBook => book !== null);

    // If we got fewer books than requested due to parsing issues, fill with top candidates
    if (recommendedBooks.length < targetCount && recommendedBooks.length < visibleCandidates.length) {
      const usedIds = new Set(recommendedBooks.map(b => b.book_id));
      for (const candidate of visibleCandidates) {
        if (!usedIds.has(candidate.book_id) && recommendedBooks.length < targetCount) {
          recommendedBooks.push({
            ...candidate,
            explanation: buildHeuristicExplanation(candidate, requirement),
          });
        }
      }
    }

    const finalBooks = enforceRecommendationConstraints(recommendedBooks, requirement, targetCount);

    // Calculate category distribution:
    const category_distribution: Record<string, number> = {};
    for (const book of finalBooks) {
      category_distribution[book.category] = (category_distribution[book.category] || 0) + 1;
    }

    // Calculate total price:
    const total_price = finalBooks.reduce((sum, book) => sum + book.price, 0);

    // Calculate quality score: simple heuristic based on candidate coverage
    // More candidates successfully used = higher quality (we found more good matches)
    const quality_score = finalBooks.length / visibleCandidates.length;

    // Calculate confidence: based on how clear the requirement is
    // More keywords and categories = higher confidence
    // If needs clarification, confidence is lower (0.3 + clarity/2)
    const clarityScore = Math.min(1, (
      (requirement.categories.length + requirement.keywords.length + requirement.preferences.length) / 6
    ));
    const confidence = requirement.needs_clarification
      ? 0.3 + clarityScore * 0.2  // Lower base confidence when clarification needed
      : 0.5 + clarityScore * 0.5;

    return {
      books: finalBooks,
      total_price,
      quality_score,
      confidence,
      category_distribution,
    };
  } catch (error) {
    // If LLM processing fails, fall back to simple heuristic ranking:
    const fallbackBooks = visibleCandidates
      .slice(0, targetCount)
      .map(book => ({
        ...book,
        explanation: buildHeuristicExplanation(book, requirement),
      }));

    const finalFallback = enforceRecommendationConstraints(fallbackBooks, requirement, targetCount);

    const category_distribution: Record<string, number> = {};
    for (const book of finalFallback) {
      category_distribution[book.category] = (category_distribution[book.category] || 0) + 1;
    }

    const total_price = finalFallback.reduce((sum, book) => sum + book.price, 0);
    const quality_score = finalFallback.length / visibleCandidates.length;
    // Lower confidence when we fall back to heuristic ranking
    const confidence = 0.5;

    return {
      books: finalFallback,
      total_price,
      quality_score,
      confidence,
      category_distribution,
    };
  }
}
