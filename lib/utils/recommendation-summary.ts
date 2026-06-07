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
  const notes: string[] = [];

  if (typeof budget === 'number') {
    notes.push(`总价 ¥${totalPrice.toFixed(2)}，${totalPrice <= budget ? '符合' : '超出'} ¥${budget.toFixed(2)} 预算`);
  }
  if (Array.isArray(result.requirement?.categories) && result.requirement.categories.length > 0) {
    notes.push(`主题：${result.requirement.categories.join('、')}`);
  }

  return `已为你推荐 ${result.recommendation.books.length} 本书${notes.length > 0 ? `，${notes.join('；')}` : ''}。`;
}
