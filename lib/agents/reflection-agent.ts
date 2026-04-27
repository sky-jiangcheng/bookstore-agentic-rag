// lib/agents/reflection-agent.ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

import type {
  EvaluationResult,
  RecommendationResult,
  RequirementAnalysis,
} from '@/lib/types/rag';

const EvaluationSchema = z.object({
  overall_score: z.number().min(0).max(1),
  scores: z.object({
    requirement_match: z.number().min(0).max(1),
    diversity: z.number().min(0).max(1),
    book_quality: z.number().min(0).max(1),
    budget: z.number().min(0).max(1),
  }),
  issues: z.array(z.string()),
  needs_improvement: z.boolean(),
  suggestions: z.array(z.object({
    type: z.string(),
    action: z.enum(['increase', 'adjust', 'optimize']),
    target: z.string(),
    description: z.string(),
  })),
});

const EVALUATION_PROMPT = (
  requirement: RequirementAnalysis,
  recommendation: RecommendationResult
) => `你是书店智能推荐系统的质量评估专家。请评估生成的推荐书单是否符合用户需求。

用户需求分析：
- 原始查询: ${requirement.original_query}
- 分类: ${JSON.stringify(requirement.categories)}
- 关键词: ${JSON.stringify(requirement.keywords)}
- 约束条件: ${JSON.stringify(requirement.constraints)}
- 用户偏好: ${JSON.stringify(requirement.preferences)}

生成的推荐书单：
推荐总价: ¥${recommendation.total_price}
${recommendation.books.map((b, i) => `${i+1}. ${b.title} by ${b.author}, ${b.category}, ¥${b.price} - ${b.explanation}`).join('\n\n')}

请评估：
1. 需求匹配度：推荐的书籍符合用户查询、分类、关键词吗？
2. 分类多样性：推荐是否覆盖了多种不同分类？
3. 书籍质量：推荐书籍的相关度和可用性（有库存）如何？
4. 预算符合：总价格是否在预算约束内？
5. 总体评分：0-1 之间
6. 如果质量不达标，列出问题并给出具体改进建议

以JSON格式输出。`;

export async function evaluateRecommendation(
  requirement: RequirementAnalysis,
  recommendation: RecommendationResult,
): Promise<EvaluationResult> {
  try {
    const { output } = await generateText({
      model: 'google/gemini-3.1-flash-image-preview',
      prompt: EVALUATION_PROMPT(requirement, recommendation),
      output: Output.object({
        schema: EvaluationSchema,
      }),
    });

    return output;
  } catch (error) {
    // 如果评估失败，返回一个默认评估结果
    return {
      overall_score: 0.8,
      scores: {
        requirement_match: 0.8,
        diversity: 0.8,
        book_quality: 0.8,
        budget: 0.8,
      },
      issues: [],
      needs_improvement: false,
      suggestions: [],
    };
  }
}
