export const CATEGORY_PATTERNS = [
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
] as const;

export const PREFERENCE_PATTERNS = [
  { pattern: /入门|基础|零基础|初学者/gi, preference: '偏入门' },
  { pattern: /进阶|深入|系统|专业/gi, preference: '偏进阶' },
  { pattern: /经典|权威|必读/gi, preference: '经典导向' },
  { pattern: /实战|案例|应用|可落地/gi, preference: '实战导向' },
  { pattern: /畅销|热门|爆款/gi, preference: '畅销导向' },
  { pattern: /考试|备考|考研|考公/gi, preference: '考试导向' },
  { pattern: /陈列|销售|门店|店员/gi, preference: '门店销售导向' },
] as const;

export const AUDIENCE_PATTERNS = [
  /大学生|本科生|研究生/gi,
  /高中生|初中生|小学生/gi,
  /老师|教师|家长|父母/gi,
  /程序员|开发者|工程师/gi,
  /产品经理|运营|销售|创业者/gi,
  /孩子|儿童|青少年/gi,
] as const;

export const KEYWORD_STOPWORDS = new Set([
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

export const COMMON_BOOK_KEYWORDS = [
  '科幻',
  '小说',
  '文学',
  '历史',
  '哲学',
  '经济',
  '管理',
  '科技',
  '计算机',
  '编程',
  '围棋',
  '象棋',
  '传记',
  '心理',
  '健康',
  '养生',
  '教育',
  '科普',
  '艺术',
  '金融',
  '投资',
  '职场',
] as const;

export function extractKnownBookKeywords(text: string): string[] {
  return COMMON_BOOK_KEYWORDS.filter((keyword) => text.includes(keyword));
}
