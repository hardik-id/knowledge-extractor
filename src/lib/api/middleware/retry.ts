import { isAbortError } from "../api-error";
import type { Middleware } from "../http-client";

export interface RetryOptions {
  /** Extra attempts after the first. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Replaceable for tests. */
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const RETRY_STATUSES = new Set([502, 503, 504]);

/** Exponential backoff with full jitter: a random wait up to base × 2^attempt, capped. */
export function retryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  return Math.round(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Retries GET requests that failed for a passing reason: no response, or a
 * 502/503/504. Never retries writes, because a POST that timed out may still
 * have been carried out.
 */
export function retryMiddleware({
  retries = 2,
  baseDelayMs = 300,
  maxDelayMs = 3_000,
  random = Math.random,
  sleep = abortableSleep,
}: RetryOptions = {}): Middleware {
  return async (request, next) => {
    if (request.method !== "GET") return next(request);

    for (let attempt = 0; ; attempt++) {
      const last = attempt >= retries;
      try {
        const response = await next(request);
        if (last || !RETRY_STATUSES.has(response.status)) return response;
      } catch (error) {
        if (last || isAbortError(error) || request.signal?.aborted) throw error;
      }
      await sleep(retryDelay(attempt, baseDelayMs, maxDelayMs, random), request.signal);
    }
  };
}
