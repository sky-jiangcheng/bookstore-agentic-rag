// lib/agents/requirement-agent.ts
import { generateText, Output } from 'ai';
import { z } from 'zod';

import type { RequirementAnalysis } from '@/lib/types/rag';

const RequirementAnalysisSchema = z.object({
  original_query: z.string(),
  categories: z.array(z.string()),
  keywords: z.array(z.string()),
  constraints: z.object({
    budget: z.number().optional(),
    target_count: z.number().optional(),
    author: z.string().optional(),
    price_min: z.number().optional(),
    price_max: z.number().optional(),
    exclude_keywords: z.array(z.string()).optional(),
  }),
  preferences: z.array(z.string()),
  needs_clarification: z.boolean(),
  clarification_questions: z.array(z.string()),
});

export interface RequirementAgentOptions {
  conversationContext?: string;
  previousRequirements?: RequirementAnalysis[];
}

const CATEGORY_PATTERNS = [
  { pattern: /围棋|象棋|国际象棋|五子棋/gi, category: '棋牌' },
  { pattern: /小说|文学|诗歌|散文/gi, category: '文学' },
  { pattern: /历史|传记|人物|革命|党史|地方史/gi, category: '历史' },
  { pattern: /编程|计算机|python|java|javascript|代码|人工智能|算法/gi, category: '计算机' },
  { pattern: /旅游|旅行|景点|城市/gi, category: '旅游' },
  { pattern: /心理|情绪|心态/gi, category: '心理学' },
  { pattern: /政治|法律|社会/gi, category: '政治' },
  { pattern: /经济|管理|商业/gi, category: '经济' },
  { pattern: /健康|养生|医疗/gi, category: '健康' },
  { pattern: /教育|学习|教材|教辅/gi, category: '教育' },
  { pattern: /哲学|思想|伦理/gi, category: '哲学' },
  { pattern: /科普|科学|物理|化学|生物/gi, category: '科普' },
  { pattern: /艺术|美术|设计|摄影|音乐/gi, category: '艺术' },
  { pattern: /儿童|少儿|亲子|绘本/gi, category: '少儿' },
  { pattern: /金融|投资|理财|财务/gi, category: '金融' },
  { pattern: /职场|沟通|演讲|写作|思维/gi, category: '成长' },
];

const PREFERENCE_PATTERNS = [
  { pattern: /入门|基础|零基础|初学者/gi, preference: '偏入门' },
  { pattern: /进阶|深入|系统|专业/gi, preference: '偏进阶' },
  { pattern: /经典|权威|必读/gi, preference: '经典导向' },
  { pattern: /实战|案例|应用|可落地/gi, preference: '实战导向' },
  { pattern: /畅销|热门|爆款/gi, preference: '畅销导向' },
  { pattern: /考试|备考|考研|考公/gi, preference: '考试导向' },
  { pattern: /陈列|销售|门店|店员/gi, preference: '门店销售导向' },
];

const AUDIENCE_PATTERNS = [
  /大学生|本科生|研究生/gi,
  /高中生|初中生|小学生/gi,
  /老师|教师|家长|父母/gi,
  /程序员|开发者|工程师/gi,
  /产品经理|运营|销售|创业者/gi,
  /孩子|儿童|青少年/gi,
];

const KEYWORD_STOPWORDS = new Set([
  '推荐',
  '书',
  '书籍',
  '书单',
  '本',
  '给',
  '一个',
  '一些',
  '适合',
  '关于',
  '相关',
  '需要',
  '希望',
  '想要',
  '用户',
  '帮我',
  '请',
  '基于',
  '以内',
  '以下',
  '预算',
  '总预算',
  '控制',
]);

function parseBudget(query: string): number | undefined {
  const patterns = [
    /预算(?:控制)?(?:在)?\s*(\d+(?:\.\d+)?)\s*元/iu,
    /总预算(?:在)?\s*(\d+(?:\.\d+)?)\s*元/iu,
    /不超过\s*(\d+(?:\.\d+)?)\s*元/iu,
    /控制总预算在\s*(\d+(?:\.\d+)?)\s*元(?:以内)?/iu,
    /(\d+(?:\.\d+)?)\s*元(?:以内|以下|之内)/iu,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return Number(match[1]);
    }
  }

  return undefined;
}

function parseTargetCount(query: string): number | undefined {
  const match = query.match(/(?:推荐|给我|来|选)?\s*(\d{1,2})\s*本/iu);
  if (!match) {
    return undefined;
  }

  return Number(match[1]);
}

function parseExcludedKeywords(query: string): string[] {
  const exclusions: string[] = [];
  const patterns = [
    /排除\s*([^\s，。；、]+)/giu,
    /不要\s*([^\s，。；、]+)/giu,
    /不含\s*([^\s，。；、]+)/giu,
    /去掉\s*([^\s，。；、]+)/giu,
    /剔除\s*([^\s，。；、]+)/giu,
  ];

  for (const pattern of patterns) {
    for (const match of query.matchAll(pattern)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      for (const token of raw.split(/[、,，/]/g)) {
        const keyword = token.trim();
        if (keyword) exclusions.push(keyword);
      }
    }
  }

  return Array.from(new Set(exclusions));
}

function extractQueryKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .match(/[\p{Script=Han}]{2,12}|[a-z0-9][a-z0-9\-_]{2,}/gu) ?? [];

  const keywords = tokens.filter((token) => {
    if (KEYWORD_STOPWORDS.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
    return true;
  });

  return Array.from(new Set(keywords)).slice(0, 16);
}

function normalizeRequirement(
  userQuery: string,
  draft: RequirementAnalysis
): RequirementAnalysis {
  const categories = new Set(draft.categories);
  const keywords = new Set(draft.keywords);
  const preferences = new Set(draft.preferences);

  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(userQuery)) {
      categories.add(category);
      const matches = userQuery.match(pattern);
      matches?.forEach((item) => keywords.add(item));
    }
  }

  for (const { pattern, preference } of PREFERENCE_PATTERNS) {
    if (pattern.test(userQuery)) {
      preferences.add(preference);
      const matches = userQuery.match(pattern);
      matches?.forEach((item) => keywords.add(item));
    }
  }

  for (const pattern of AUDIENCE_PATTERNS) {
    if (pattern.test(userQuery)) {
      const matches = userQuery.match(pattern);
      matches?.forEach((item) => {
        preferences.add(`受众:${item}`);
        keywords.add(item);
      });
    }
  }

  for (const keyword of extractQueryKeywords(userQuery)) {
    keywords.add(keyword);
  }

  const budget = parseBudget(userQuery);
  const targetCount = parseTargetCount(userQuery);
  const excludeKeywords = parseExcludedKeywords(userQuery);

  return {
    ...draft,
    original_query: userQuery,
    categories: Array.from(categories),
    keywords: Array.from(keywords),
    constraints: {
      ...draft.constraints,
      ...(budget !== undefined ? { budget } : {}),
      ...(targetCount !== undefined ? { target_count: targetCount } : {}),
      ...(excludeKeywords.length > 0 ? { exclude_keywords: excludeKeywords } : {}),
    },
    preferences: Array.from(preferences),
  };
}

// Extract prompt as constant to avoid recreation on each call
const ANALYSIS_PROMPT = (userQuery: string, conversationContext?: string) => `你是书店智能推荐系统的需求分析专家。请分析用户的查询，提取结构化信息。

${conversationContext ? `历史对话上下文:\n${conversationContext}\n` : ''}

当前用户查询: ${userQuery}

请提取：
1. categories: 用户提到的书籍分类（如"小说"，"历史"，"围棋"，"计算机"等）
2. keywords: 关键词（书名、主题、作者等关键词）
3. constraints: 约束条件 - 预算（总价上限），目标书籍数量，特定作者，价格区间，排除关键词(exclude_keywords)
4. preferences: 用户偏好描述（如"深入浅出"，"经典"，"新书"）

**关于 needs_clarification 的判断规则**：
设置为 true 的情况（信息严重不足）：
- 用户只说"推荐书"、"给我推荐"、"有什么书"等完全无信息查询
- 用户的查询过于简短且无明确意图（如只有"书"一个字）

设置为 false 的情况（可以尝试推荐）：
- 用户提到了任何具体的分类（如"围棋"、"小说"、"历史"等）
- 用户提到了具体的主题或领域
- 用户表达了学习或了解某个主题的意图（如"想学习XX"、"了解XX"）
- 用户想要推荐某个类型的书籍

**重要原则**：宁可不完美地推荐，也不要过度要求澄清。只要用户提供了任何有意义的线索，就应该设置为 false 并尝试推荐。

5. needs_clarification: 根据以上规则判断
6. clarification_questions: 仅当 needs_clarification 为 true 时，列出1个简洁的澄清问题

${conversationContext ? `注意：结合历史对话上下文来理解用户需求。如果用户提到"同样的类型"或"再来几本"，请参考历史对话中的分类和关键词。` : ''}`;

export async function analyzeRequirement(
  userQuery: string,
  options?: RequirementAgentOptions,
): Promise<RequirementAnalysis> {
  try {
    console.log('[RequirementAgent] Analyzing query:', userQuery);
    console.log('[RequirementAgent] Conversation context:', options?.conversationContext ? 'present' : 'none');

    const { output } = await generateText({
      model: 'google/gemini-3.1-flash',
      prompt: ANALYSIS_PROMPT(userQuery, options?.conversationContext),
      output: Output.object({
        schema: RequirementAnalysisSchema,
      }),
    });

    console.log('[RequirementAgent] Analysis result:', JSON.stringify({
      ...output,
      original_query: userQuery,
    }));

    // Ensure original_query is set correctly to the input:
    return normalizeRequirement(userQuery, {
      ...output,
      original_query: userQuery,
    });
  } catch (error) {
    console.error('[RequirementAgent] Analysis failed:', error);

    // Improved fallback: Try to extract basic info from the query
    const extractedCategories: string[] = [];
    const extractedKeywords: string[] = [];

    // Common book categories
    for (const { pattern, category } of CATEGORY_PATTERNS) {
      if (pattern.test(userQuery)) {
        extractedCategories.push(category);
        // Also add matched terms as keywords
        const matches = userQuery.match(pattern);
        if (matches) {
          extractedKeywords.push(...matches);
        }
      }
    }

    const queryKeywords = extractQueryKeywords(userQuery);
    extractedKeywords.push(...queryKeywords);

    // If we found any meaningful information, don't require clarification
    const hasMeaningfulInfo = extractedCategories.length > 0 || extractedKeywords.length > 0;

    return normalizeRequirement(userQuery, {
      original_query: userQuery,
      categories: extractedCategories,
      keywords: [...new Set(extractedKeywords)],
      constraints: {},
      preferences: [],
      needs_clarification: !hasMeaningfulInfo,
      clarification_questions: hasMeaningfulInfo ? [] : [
        '你对什么类型的书籍感兴趣？比如文学、历史、科技、旅游等。',
      ],
    });
  }
}
