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
