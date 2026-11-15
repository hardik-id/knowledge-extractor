import { createHttpClient, type HttpClient } from "./http-client";
import { authMiddleware } from "./middleware/auth";
import { errorMiddleware } from "./middleware/errors";
import { requestIdMiddleware } from "./middleware/request-id";
import { retryMiddleware } from "./middleware/retry";
import { timeoutMiddleware } from "./middleware/timeout";
import type { TokenProvider } from "./token-provider";

export { ApiError, isAbortError, isApiError } from "./api-error";
export type { HttpClient, Middleware, RequestOptions } from "./http-client";
export { createMemoryTokenProvider } from "./token-provider";
export type { TokenProvider } from "./token-provider";

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenProvider;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * The standard client for the Django API. Order matters, outermost first:
 * errors      turns the final outcome into an ApiError
 * request-id  one id per call, shared by its retries
 * auth        bearer token, one refresh-and-retry on 401
 * retry       GET only, on 502/503/504 or no response
 * timeout     per attempt, so each retry gets a fresh limit
 */
export function createApiClient({
  baseUrl,
  tokens,
  timeoutMs,
  fetch,
}: ApiClientOptions): HttpClient {
  return createHttpClient({
    baseUrl,
    fetch,
    middlewares: [
      errorMiddleware(),
      requestIdMiddleware(),
      authMiddleware(tokens),
      retryMiddleware(),
      timeoutMiddleware(timeoutMs),
    ],
  });
}
