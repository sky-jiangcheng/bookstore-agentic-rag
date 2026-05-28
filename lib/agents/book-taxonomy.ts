export const CATEGORY_PATTERNS = [
  { pattern: /围棋|象棋|国际象棋|五子棋/i, category: '棋牌' },
  { pattern: /小说|文学|诗歌|散文/i, category: '文学' },
  { pattern: /历史|传记|革命|党史|地方史/i, category: '历史' },
  { pattern: /编程|计算机|python|java|javascript|代码|人工智能|算法/i, category: '计算机' },
  { pattern: /旅游|旅行|景点|城市/i, category: '旅游' },
  { pattern: /心理|情绪|心态/i, category: '心理学' },
  { pattern: /政治|法律|社会/i, category: '政治' },
  { pattern: /经济|管理|商业/i, category: '经济' },
  { pattern: /健康|养生|医疗/i, category: '健康' },
  { pattern: /教育|学习|教材|教辅/i, category: '教育' },
  { pattern: /哲学|思想|伦理/i, category: '哲学' },
  { pattern: /科普|科学|物理|化学|生物/i, category: '科普' },
  { pattern: /艺术|美术|设计|摄影|音乐/i, category: '艺术' },
  { pattern: /儿童|少儿|亲子|绘本/i, category: '少儿' },
  { pattern: /金融|投资|理财|财务/i, category: '金融' },
  { pattern: /职场|沟通|演讲|写作|思维/i, category: '成长' },
] as const;

export const PREFERENCE_PATTERNS = [
  { pattern: /入门|基础|零基础|初学者/i, preference: '偏入门' },
  { pattern: /进阶|深入|系统|专业/i, preference: '偏进阶' },
  { pattern: /经典|权威|必读/i, preference: '经典导向' },
  { pattern: /实战|案例|应用|可落地/i, preference: '实战导向' },
  { pattern: /畅销|热门|爆款/i, preference: '畅销导向' },
  { pattern: /考试|备考|考研|考公/i, preference: '考试导向' },
  { pattern: /陈列|销售|门店|店员/i, preference: '门店销售导向' },
] as const;

export const AUDIENCE_PATTERNS = [
  /大学生|本科生|研究生/i,
  /高中生|初中生|小学生/i,
  /老师|教师|家长|父母/i,
  /程序员|开发者|工程师/i,
  /产品经理|运营|销售|创业者/i,
  /孩子|儿童|青少年/i,
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
