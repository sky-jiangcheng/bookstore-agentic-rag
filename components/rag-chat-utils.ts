export interface BookRecommendation {
  title: string;
  author: string;
  price: number;
  explanation: string;
  book_id: number | string;
}

export interface RequirementSnapshot {
  categories: string[];
  keywords: string[];
  constraints: {
    budget?: number;
    target_count?: number;
    exclude_keywords?: string[];
  };
}

export interface AssistantMessageType {
  recommendations?: BookRecommendation[];
  requirement?: RequirementSnapshot;
  totalPrice?: number;
}

export function buildFollowUpPrompts(lastUserQuery: string, assistantMessage?: AssistantMessageType) {
  if (!lastUserQuery) {
    return [];
  }

  const recommendations = assistantMessage?.recommendations ?? [];
  const requirement = assistantMessage?.requirement;
  const budget = requirement?.constraints.budget;
  const targetCount = requirement?.constraints.target_count;
  const excluded = requirement?.constraints.exclude_keywords ?? [];
  const totalPrice = assistantMessage?.totalPrice ?? 0;

  if (recommendations.length === 0) {
    return [
      `沿用"${lastUserQuery}"，补充"给谁读 + 推荐几本 + 预算上限"`,
      `沿用"${lastUserQuery}"，加一条"排除教材/教辅"`,
      `沿用"${lastUserQuery}"，指定更明确主题词（例如历史/AI/管理）`,
    ];
  }

  const prompts: string[] = [];
  const firstTitle = recommendations[0]?.title;

  if (firstTitle) {
    prompts.push(`保持当前主题，围绕《${firstTitle}》再补充 3 本同主题书`);
  }

  if (typeof budget === 'number') {
    prompts.push(`基于"${lastUserQuery}"，保持预算 ¥${budget} 不变，替换成更高相关度的书`);
    if (totalPrice > budget) {
      prompts.push(`基于"${lastUserQuery}"，严格把总价压到 ¥${budget} 以内`);
    }
  } else {
    prompts.push(`基于"${lastUserQuery}"，增加硬预算约束：总价不超过 150 元`);
  }

  if (typeof targetCount === 'number') {
    prompts.push(`基于"${lastUserQuery}"，数量固定 ${targetCount} 本，优先保留最相关的`);
  } else {
    prompts.push(`基于"${lastUserQuery}"，把数量固定为 5 本并给出排序理由`);
  }

  if (excluded.length === 0) {
    prompts.push(`基于"${lastUserQuery}"，增加排除词：教材、教辅`);
  } else {
    prompts.push(`基于"${lastUserQuery}"，继续排除：${excluded.join('、')}，并补充同主题替代书`);
  }

  return Array.from(new Set(prompts)).slice(0, 3);
}

export function normalizeBookRecommendations(
  raw: Array<Record<string, unknown>>,
): BookRecommendation[] {
  return raw
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title.trim() : '未命名图书',
      author: typeof item.author === 'string' ? item.author.trim() : '未知作者',
      price: typeof item.price === 'number' ? item.price : Number(item.price) || 0,
      explanation: typeof item.explanation === 'string' ? item.explanation.trim() : '',
      book_id: String(item.book_id ?? ''),
    }))
    .filter((r) => r.title !== '未命名图书' || r.author !== '未知作者');
}

export function normalizeRequirementSnapshot(
  raw: Record<string, unknown>,
): RequirementSnapshot {
  const constraints = (raw.constraints ?? {}) as Record<string, unknown>;
  return {
    categories: Array.isArray(raw.categories) ? raw.categories as string[] : [],
    keywords: Array.isArray(raw.keywords) ? raw.keywords as string[] : [],
    constraints: {
      budget: typeof constraints.budget === 'number' ? constraints.budget : Number(constraints.budget) || undefined,
      target_count: typeof constraints.target_count === 'number' ? constraints.target_count : Number(constraints.target_count) || undefined,
      exclude_keywords: Array.isArray(constraints.exclude_keywords) ? constraints.exclude_keywords as string[] : [],
    },
  };
}
