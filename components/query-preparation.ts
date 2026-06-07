import type { RequirementAnalysis } from '@/lib/types/rag';

export interface RequirementTemplate {
  id: string;
  name: string;
  sourceText: string;
  normalizedText: string;
  requirement: RequirementAnalysis;
  categoryWeight: number;
  keywordWeight: number;
  updatedAt: string;
}

export function normalizeRequirementText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:："'“”‘’（）()【】[\]]+/g, '');
}

export function findExactTemplate(
  query: string,
  templates: RequirementTemplate[],
): RequirementTemplate | undefined {
  const normalized = normalizeRequirementText(query);
  return templates.find((template) => template.normalizedText === normalized);
}

const COLLISION_GROUPS: Array<{ pattern: RegExp; words: string[] }> = [
  { pattern: /应试|备考|考试|刷题|升学/u, words: ['教辅', '题库', '考试', '真题', '试卷'] },
  { pattern: /教材|课本|教科书/u, words: ['教材', '教科书', '课本'] },
  { pattern: /低俗|色情|成人/u, words: ['低俗', '色情', '成人'] },
];

export function suggestExclusionCollisions(query: string, vocabulary: string[]): string[] {
  const normalizedVocabulary = new Set(vocabulary.map((word) => word.trim()).filter(Boolean));
  const suggestions = new Set<string>();

  for (const group of COLLISION_GROUPS) {
    if (!group.pattern.test(query)) continue;
    for (const word of group.words) {
      if (normalizedVocabulary.has(word)) suggestions.add(word);
    }
  }

  return Array.from(suggestions);
}

export function buildPseudoSql(
  requirement: RequirementAnalysis,
  categoryWeight: number,
  keywordWeight: number,
): string {
  const clauses: string[] = [];
  const categories = requirement.categories.filter(Boolean);
  const keywords = requirement.keywords.filter(Boolean).slice(0, 8);
  const exclusions = requirement.constraints.exclude_keywords?.filter(Boolean) ?? [];

  if (categories.length > 0) {
    clauses.push(`category ILIKE ANY (ARRAY[${categories.map((item) => `'%${item.replaceAll("'", "''")}%'`).join(', ')}])`);
  }
  if (keywords.length > 0) {
    clauses.push(`search_text ILIKE ANY (ARRAY[${keywords.map((item) => `'%${item.replaceAll("'", "''")}%'`).join(', ')}])`);
  }
  if (exclusions.length > 0) {
    clauses.push(`NOT (search_text ILIKE ANY (ARRAY[${exclusions.map((item) => `'%${item.replaceAll("'", "''")}%'`).join(', ')}]))`);
  }
  if (typeof requirement.constraints.price_min === 'number') {
    clauses.push(`price >= ${requirement.constraints.price_min}`);
  }
  if (typeof requirement.constraints.price_max === 'number') {
    clauses.push(`price <= ${requirement.constraints.price_max}`);
  }

  return [
    '-- 查询预览：确认调整后才会生效',
    `-- category_weight = ${categoryWeight.toFixed(1)}, keyword_weight = ${keywordWeight.toFixed(1)}`,
    'SELECT title, author, category, price, relevance_score',
    'FROM books',
    clauses.length > 0 ? `WHERE ${clauses.join('\n  AND ')}` : '-- 暂无过滤条件',
    'ORDER BY relevance_score DESC',
    `LIMIT ${requirement.constraints.target_count ?? 15};`,
  ].join('\n');
}
