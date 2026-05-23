export class AsyncTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number, label = 'operation') {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'AsyncTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AsyncTimeoutError(timeoutMs, label));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 带超时的Promise执行器
 * 当超时时，返回一个拒绝Promise，支持传入自定义错误工厂函数
 *
 * @param executor - 要执行的异步函数
 * @param timeoutMs - 超时时间（毫秒）
 * @param timeoutError - 超时时使用的错误对象或工厂函数
 * @returns Promise结果
 */
export async function withTimeoutAndError<T, E extends Error>(
  executor: () => Promise<T>,
  timeoutMs: number,
  timeoutError: E | ((timeoutMs: number) => E),
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const createError = typeof timeoutError === 'function'
    ? timeoutError
    : () => timeoutError;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createError(timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([executor(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 带重试的Promise执行器
 *
 * @param executor - 要执行的异步函数
 * @param options - 重试选项
 * @returns Promise结果
 */
export async function withRetry<T>(
  executor: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await executor();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        onRetry?.(attempt, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}