/**
 * 安全错误处理工具
 *
 * 防止内部错误信息（堆栈跟踪、数据库连接串、内部服务名称等）
 * 泄露到外部 API 响应中。
 */

/** 生产环境下的通用错误消息 */
const GENERIC_ERROR_MESSAGE = '服务器内部错误，请稍后重试';

/**
 * 判断当前是否为生产环境
 */
function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/**
 * 获取安全的错误消息。
 * 生产环境返回通用消息，开发环境返回原始消息。
 *
 * @param error - 捕获的错误对象
 * @param fallbackMessage - 非生产环境下的兜底消息
 * @returns 对外安全的错误消息字符串
 */
export function getSafeErrorMessage(
  error: unknown,
  fallbackMessage: string = 'Internal server error',
): string {
  if (isProduction()) {
    return GENERIC_ERROR_MESSAGE;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallbackMessage;
}

/**
 * 构建标准化的错误响应体。
 * 生产环境不包含内部细节，开发环境保留调试信息。
 *
 * @param error - 捕获的错误对象
 * @param publicMessage - 面向用户的错误描述
 */
export function buildSafeErrorResponse(
  error: unknown,
  publicMessage: string = '服务暂时不可用',
): { error: string; details?: string } {
  if (isProduction()) {
    return { error: publicMessage };
  }
  return {
    error: publicMessage,
    details: error instanceof Error ? error.message : String(error),
  };
}

/**
 * 安全地将错误记录到服务端日志（不会暴露到 HTTP 响应）。
 *
 * @param context - 错误上下文标签（如 '[RAG Chat]'）
 * @param error - 捕获的错误对象
 */
export function logServerError(context: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`${context} ${error.message}`, error.stack);
  } else {
    console.error(`${context}`, error);
  }
}
