import type { RequirementAnalysis, RecommendationResult } from '@/lib/types/rag';

interface HasRecommendation {
  requirement?: Pick<RequirementAnalysis, 'constraints' | 'categories'>;
  recommendation?: Pick<RecommendationResult, 'books' | 'total_price'>;
}

export function buildRecommendationSummary(result: HasRecommendation): string {
  if (!result.recommendation || result.recommendation.books.length === 0) {
    return '抱歉，没有找到相关书籍。';
  }

  const budget = result.requirement?.constraints?.budget;
  const totalPrice = Number(result.recommendation?.total_price ?? 0);
  const excludedKeywords = result.requirement?.constraints?.exclude_keywords ?? [];
  const hardConstraintNotes: string[] = [];

  if (typeof budget === 'number') {
    hardConstraintNotes.push(`预算约束：¥${totalPrice.toFixed(2)} / ¥${budget.toFixed(2)}（${totalPrice <= budget ? '已满足' : '未满足'}）`);
  }
  if (Array.isArray(result.requirement?.categories) && result.requirement.categories.length > 0) {
    hardConstraintNotes.push(`分类约束：${result.requirement.categories.join('、')}`);
  }
  if (Array.isArray(excludedKeywords) && excludedKeywords.length > 0) {
    hardConstraintNotes.push(`排除词约束：${excludedKeywords.join('、')}`);
  }

  const bookLines = result.recommendation.books.map(
    (book, index) =>
      `${index + 1}. ${book.title} - ${book.author}\n${book.explanation}`
  );

  return [
    `为你推荐 ${result.recommendation.books.length} 本书:`,
    ...(hardConstraintNotes.length > 0 ? [`硬约束执行结果：${hardConstraintNotes.join('；')}`] : []),
    ...bookLines,
  ].join('\n\n');
}
