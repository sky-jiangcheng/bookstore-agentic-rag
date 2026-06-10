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

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const config = APP_CONFIG as any; // 用于验证目的的临时转换
  
  // 验证馆别类型
  if (!config.libraryTypes || config.libraryTypes.length === 0) {
    errors.push('libraryTypes 不能为空');
  }
  
  // 验证阈值范围
  if (APP_CONFIG.categoryMapping.confidenceThreshold < 0 || 
      APP_CONFIG.categoryMapping.confidenceThreshold > 1) {
    errors.push('confidenceThreshold 必须在 0-1 之间');
  }
  
  if (APP_CONFIG.qualityIssues.lowConfidenceThreshold < 0 || 
      APP_CONFIG.qualityIssues.lowConfidenceThreshold > 1) {
    errors.push('lowConfidenceThreshold 必须在 0-1 之间');
  }
  
  // 验证最小书籍数
  if (APP_CONFIG.categoryMapping.minBookCount < 0) {
    errors.push('minBookCount 不能为负数');
  }
  
  if (APP_CONFIG.qualityIssues.unmappedMinBooks < 0) {
    errors.push('unmappedMinBooks 不能为负数');
  }
  
  // 验证限制范围
  const { defaultLimit, maxLimit } = APP_CONFIG.categoryMapping;
  if (defaultLimit > maxLimit) {
    errors.push('defaultLimit 不能大于 maxLimit');
  }
  
  // 验证不匹配规则
  const validLibraryTypes = new Set(APP_CONFIG.libraryTypes);
  for (const [category, forbiddenLibraries] of Object.entries(APP_CONFIG.qualityIssues.mismatchedRules)) {
    if (!category) {
      errors.push('mismatchedRules 中的类别不能为空');
    }
    for (const library of forbiddenLibraries) {
      if (!validLibraryTypes.has(library)) {
        errors.push(`mismatchedRules 中的馆别 "${library}" 不在 libraryTypes 中`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}