export const APP_CONFIG = {
  libraryTypes: ['公共馆', '成人目录', '初高中', '小学', '大学'],
  categoryMapping: {
    confidenceThreshold: 0.3,
    minBookCount: 1000,
    defaultLimit: 100,
    maxLimit: 500,
  },
  qualityIssues: {
    lowConfidenceThreshold: 0.3,
    unmappedMinBooks: 100,
    mismatchedRules: {
      '企业管理': ['小学'],
      '高等学校': ['小学'],
      '大学生': ['小学'],
      '童话': ['大学'],
      '儿童故事': ['大学'],
      '图画故事': ['大学'],
      '儿童小说': ['大学'],
      '考研': ['小学'],
    },
  },
} as const;

export type LibraryType = typeof APP_CONFIG.libraryTypes[number];
export type ConfidenceThreshold = typeof APP_CONFIG.categoryMapping.confidenceThreshold;