interface CatalogRerankBook {
  title?: unknown;
  author?: unknown;
  publisher?: unknown;
  category?: unknown;
  description?: unknown;
  relevance_score?: unknown;
}

interface ScoredBook<T extends CatalogRerankBook> {
  book: T;
  score: number;
  index: number;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  健康: ['健康', '养生', '医疗', '免疫力', '中老年', '老人', '长辈', '保健'],
  科普: ['科普', '科学', '知识', '百科'],
  历史: ['历史', '党史', '地方史', '人物传记', '地方文化', '革命', '传记'],
  计算机: ['计算机', '编程', '算法', '人工智能', '软件', '开发', 'python', 'java', 'javascript'],
  教育: ['教育', '教材', '教辅', '学习'],
  文学: ['文学', '小说', '散文', '诗歌'],
  旅游: ['旅游', '旅行', '城市', '地理'],
  心理学: ['心理', '情绪', '心态', '心理学'],
  政治: ['政治', '法律', '社会', '行政法'],
  经济: ['经济', '管理', '商业'],
  法律: ['法律', '法学', '法规', '法务', '合同法', '民法典', '刑法', '诉讼'],
  公共管理: ['公共管理', '行政管理', '公共政策', '政府', '行政'],
  办公室: ['办公室', '职场', '办公', '公文', '秘书', '职场礼仪', '职场技能'],
  哲学: ['哲学', '思想', '伦理'],
  艺术: ['艺术', '美术', '设计', '摄影', '音乐'],
  少儿: ['少儿', '儿童', '绘本', '亲子'],
  金融: ['金融', '投资', '理财', '财务'],
  成长: ['职场', '沟通', '演讲', '写作', '思维', '成长', '自我提升', '领导力'],
  棋牌: ['围棋', '象棋', '国际象棋', '五子棋'],
};

const GENERIC_STOPWORDS = new Set<string>([
  '推荐',
  '书',
  '书籍',
  '书单',
  '适合',
  '相关',
  '一些',
  '一个',
  '一本',
  '给我',
  '来',
  '看看',
  '可以',
  '想要',
  '希望',
  '关于',
  '比较',
  '家里',
  '家人',
  '最好',
  '请',
  '帮我',
  '有哪些',
  '哪些',
]);

const SEARCH_INTENT_RULES: Array<{ terms: string[]; triggers: string[] }> = [
  { terms: ['健康', '养生', '医疗', '免疫力', '中老年', '老人', '长辈', '保健', '科普'], triggers: ['健康', '养生', '医疗', '免疫力', '中老年', '老人', '长辈', '保健'] },
  { terms: ['科普', '科学', '知识', '百科'], triggers: ['科普', '科学', '知识', '百科'] },
  { terms: ['历史', '传记', '人物', '鲁迅'], triggers: ['历史', '传记', '人物', '鲁迅'] },
  { terms: ['旅游', '旅行', '城市', '文化', '人文', '地理'], triggers: ['旅游', '旅行', '景点', '城市', '人文', '文化'] },
  { terms: ['心理', '情绪', '心态', '心理学'], triggers: ['心理', '情绪', '心态', '心理学'] },
  { terms: ['职场', '沟通', '演讲', '写作', '思维'], triggers: ['职场', '沟通', '演讲', '写作', '思维'] },
  { terms: ['儿童', '少儿', '绘本', '亲子'], triggers: ['儿童', '少儿', '绘本', '亲子'] },
  { terms: ['象棋', '残局', '布局', '开局', '中局', '实战'], triggers: ['象棋'] },
  { terms: ['围棋', '定式', '死活', '布局', '实战'], triggers: ['围棋'] },
  { terms: ['国际象棋', '开局', '中局', '残局', '实战'], triggers: ['国际象棋'] },
  { terms: ['五子棋', '布局', '实战', '开局'], triggers: ['五子棋'] },
  // 法律/行政法
  { terms: ['法律', '法学', '行政法', '行政诉讼法', '宪法', '民法', '刑法'], triggers: ['法律', '法学', '行政法', '行政诉讼法', '行政', '诉讼法', '宪法', '民法', '刑法'] },
  // 公共管理/政治学
  { terms: ['公共管理', '行政管理', '政治学', '政治', '公共', '行政'], triggers: ['公共管理', '公共行政', '政治学', '行政管理', '公共', '行政'] },
  // 办公室实务/职业发展
  { terms: ['办公室', '实务', '办公', '职业', '职场', '新人', '工作'], triggers: ['办公室', '实务', '办公', '职业', '职场', '新人', '工作'] },
  // 金融/投资/理财
  { terms: ['金融', '投资', '理财', '财务', '经济'], triggers: ['金融', '投资', '理财', '财务', '经济'] },
];

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function collectIntentTerms(normalizedQuery: string): string[] {
  const terms: string[] = [];

  for (const rule of SEARCH_INTENT_RULES) {
    if (rule.triggers.some((trigger) => normalizedQuery.includes(trigger.toLowerCase()))) {
      for (const term of rule.terms) {
        terms.push(term.toLowerCase());
      }
    }
  }

  return unique(terms);
}

function extractTerms(query: unknown): string[] {
  const normalized = normalizeText(query);
  if (!normalized) {
    return [];
  }

  const rawTerms = normalized.match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}]{2,}/gu) ?? [];
  const terms = rawTerms
    .map((term) => term.trim())
    .filter((term) => term && !GENERIC_STOPWORDS.has(term));

  terms.push(...collectIntentTerms(normalized));

  return unique(terms);
}

function buildCatalogSearchTerms(query: unknown): string[] {
  const normalized = normalizeText(query);
  if (!normalized) {
    return [];
  }

  const terms = collectIntentTerms(normalized);
  if (terms.length > 0) {
    return terms;
  }

  const fallbackTerms = normalized.match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}]{2,}/gu) ?? [];
  return unique(
    fallbackTerms
      .map((term) => term.trim())
      .filter((term) => term && !GENERIC_STOPWORDS.has(term))
      .slice(0, 8)
  );
}

function buildCatalogSearchQuery(query: unknown): string {
  const terms = buildCatalogSearchTerms(query);
  return terms.length > 0 ? terms.join(' ') : normalizeText(query);
}

function matchCount(haystack: string, terms: string[]): number {
  let count = 0;
  for (const term of terms) {
    if (term && haystack.includes(term)) {
      count += 1;
    }
  }
  return count;
}

function containsAny(haystack: string, terms: string[]): boolean {
  return terms.some((term) => term && haystack.includes(term));
}

function matchCategories(book: CatalogRerankBook, normalizedQuery: string): string[] {
  const category = normalizeText(book.category);
  const title = normalizeText(book.title);
  const queryCategoryHits: string[] = [];

  for (const [label, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const matched = aliases.some((alias) => normalizedQuery.includes(alias.toLowerCase()));
    if (matched && (label.toLowerCase() === category || aliases.some((alias) => category.includes(alias.toLowerCase())))) {
      queryCategoryHits.push(label);
      continue;
    }

    if (matched && aliases.some((alias) => title.includes(alias.toLowerCase()))) {
      queryCategoryHits.push(label);
    }
  }

  return unique(queryCategoryHits);
}

function computeBookScore(book: CatalogRerankBook, query: unknown, index: number): { score: number; index: number } {
  const normalizedQuery = normalizeText(query);
  const queryTerms = extractTerms(query);
  const title = normalizeText(book.title);
  const author = normalizeText(book.author);
  const publisher = normalizeText(book.publisher);
  const category = normalizeText(book.category);
  const description = normalizeText(book.description);
  const haystack = `${title} ${author} ${publisher} ${category} ${description}`.trim();
  const relevance = Number(book.relevance_score ?? 0);

  if (!normalizedQuery || queryTerms.length === 0) {
    return {
      score: relevance,
      index,
    };
  }

  let score = Math.log1p(Math.max(0, relevance)) * 0.35;

  const titleHits = matchCount(title, queryTerms);
  const authorHits = matchCount(author, queryTerms);
  const publisherHits = matchCount(publisher, queryTerms);
  const categoryHits = matchCount(category, queryTerms);
  const descriptionHits = matchCount(description, queryTerms);
  const queryCategoryHits = matchCategories(book, normalizedQuery);
  const hasQigongTopic = /象棋/.test(normalizedQuery);
  const hasWeiqiTopic = /围棋/.test(normalizedQuery);
  const hasGuojiXiangqiTopic = /国际象棋/.test(normalizedQuery);
  const hasWuziqiTopic = /五子棋/.test(normalizedQuery);
  const hasHistoryBioTopic = /历史/.test(normalizedQuery) || /传记/.test(normalizedQuery) || /人物/.test(normalizedQuery) || /鲁迅/.test(normalizedQuery);
  const hasLuXunTopic = /鲁迅/.test(normalizedQuery);

  score += titleHits * 3.5;
  score += categoryHits * 2.6;
  score += authorHits * 1.4;
  score += publisherHits * 0.8;
  score += descriptionHits * 0.6;

  if (queryCategoryHits.length > 0) {
    score += 4.5;
  }

  if (titleHits > 0 && categoryHits > 0) {
    score += 1.25;
  }

  if (titleHits > 0 && /健康|养生|科普|医疗|免疫力|长辈|老人|中老年/.test(normalizedQuery)) {
    score += 0.9;
  }

  const lexicalOverlap = titleHits + authorHits + publisherHits + categoryHits + descriptionHits;
  if (lexicalOverlap === 0) {
    score -= 2.75;
  }

  if (/健康|养生|医疗|免疫力|长辈|老人|中老年/.test(normalizedQuery) && /健康|养生|医疗|免疫力|长辈|老人|中老年/.test(haystack)) {
    score += 2.2;
  }

  if (/科普|科学|知识/.test(normalizedQuery) && /科普|科学|知识/.test(haystack)) {
    score += 1.8;
  }

  if (hasQigongTopic) {
    if (containsAny(haystack, ['象棋'])) {
      score += 4.5;
    }
    if (containsAny(haystack, ['围棋', '国际象棋', '五子棋'])) {
      score -= 4.5;
    }
  }

  if (hasWeiqiTopic) {
    if (containsAny(haystack, ['围棋'])) {
      score += 4.5;
    }
    if (containsAny(haystack, ['象棋', '国际象棋', '五子棋'])) {
      score -= 4.5;
    }
  }

  if (hasGuojiXiangqiTopic) {
    if (containsAny(haystack, ['国际象棋'])) {
      score += 4.5;
    }
    if (containsAny(haystack, ['象棋', '围棋', '五子棋'])) {
      score -= 4.5;
    }
  }

  if (hasWuziqiTopic) {
    if (containsAny(haystack, ['五子棋'])) {
      score += 4.5;
    }
    if (containsAny(haystack, ['象棋', '围棋', '国际象棋'])) {
      score -= 4.5;
    }
  }

  if (hasHistoryBioTopic) {
    if (containsAny(haystack, ['传记', '人物', '鲁迅'])) {
      score += 2.8;
    }
    if (containsAny(haystack, ['小说'])) {
      score -= 2.6;
    }
  }

  if (hasLuXunTopic) {
    if (containsAny(haystack, ['鲁迅'])) {
      score += 20;
    } else {
      score -= 4.5;
    }
  }

  return {
    score,
    index,
  };
}

function rerankCatalogBooks<T extends CatalogRerankBook>(books: T[], query: unknown): Array<T & { relevance_score: number }> {
  if (!Array.isArray(books) || books.length === 0) {
    return [];
  }

  const scored: Array<ScoredBook<T>> = books.map((book, index) => ({
    book,
    ...computeBookScore(book, query, index),
  }));

  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.index - b.index;
  });

  return sorted.map(({ book, score }) => ({
    ...book,
    relevance_score: score,
  })) as Array<T & { relevance_score: number }>;
}

export {
  CATEGORY_ALIASES,
  buildCatalogSearchQuery,
  buildCatalogSearchTerms,
  rerankCatalogBooks,
};
