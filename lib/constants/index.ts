/**
 * 检索系统常量配置
 * 集中管理Magic Numbers，提高代码可读性和可维护性
 */

export const RETRIEVAL_CONSTANTS = {
  /**
   * 关键词过滤配置
   */
  MIN_KEYWORD_LENGTH: 2,
  MAX_KEYWORDS: 18,

  /**
   * 相关性评分权重
   */
  SCORE_WEIGHTS: {
    CATEGORY_MATCH: 2,
    KEYWORD_MATCH: 0.8,
    KEYWORD_MISMATCH_PENALTY: 2,
    EXCLUDED_KEYWORD_PENALTY: 8,
    BUDGET_EXCEED_PENALTY: 5,
  },

  /**
   * 类别别名映射
   */
  CATEGORY_ALIASES: {
    历史: ['历史', '党史', '地方史', '人物传记', '地方文化', '革命', '传记'],
    计算机: ['计算机', '编程', '算法', '人工智能', '软件', '开发', 'python', 'java'],
    教育: ['教育', '教材', '教辅', '学习'],
    文学: ['文学', '小说', '散文', '诗歌'],
    旅游: ['旅游', '旅行', '城市', '地理'],
    科普: ['科普', '科学', '物理', '化学', '生物'],
    艺术: ['艺术', '美术', '设计', '摄影', '音乐'],
    少儿: ['少儿', '儿童', '绘本', '亲子'],
    金融: ['金融', '投资', '理财', '财务'],
    成长: ['职场', '沟通', '思维', '写作', '演讲'],
    哲学: ['哲学', '思想', '伦理'],
  } as Record<string, string[]>,

  /**
   * 停用词列表
   */
  STOPWORDS: new Set(['推荐', '书', '书籍', '书单', '适合', '相关', '一个', '一些', '用户']),

  /**
   * 结果限制
   */
  MIN_RECOMMENDATIONS: 5,
  MAX_RECOMMENDATIONS: 100000,
  DEFAULT_RECOMMENDATIONS: 20,
} as const;

export const BOOK_LIST_CONSTANTS = {
  MIN_INPUT_LENGTH: 5,
  MIN_LIMIT: 5,
  MAX_LIMIT: 100000,
  DEFAULT_LIMIT: 20,
  CONFIDENCE_THRESHOLD: 0.9,
  LOW_CONFIDENCE: 0.78,
  HIGH_CONFIDENCE: 0.92,
} as const;
