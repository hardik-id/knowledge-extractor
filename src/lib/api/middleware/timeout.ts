import { ApiError } from "../api-error";
import type { Middleware } from "../http-client";
import { REQUEST_ID_HEADER } from "./request-id";

/**
 * Fails a call that gets no response within `defaultMs` (or the request's own
 * `timeoutMs`). The caller's AbortSignal still cancels it. Covers the time
 * until the response headers arrive.
 */
export function timeoutMiddleware(defaultMs = 15_000): Middleware {
  return async (request, next) => {
    const ms = request.timeoutMs ?? defaultMs;
    const caller = request.signal;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(caller?.reason);

    if (caller?.aborted) onCallerAbort();
    else caller?.addEventListener("abort", onCallerAbort, { once: true });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);

    try {
      return await next({ ...request, signal: controller.signal });
    } catch (error) {
      if (timedOut) {
        throw new ApiError({
          status: 0,
          code: "timeout",
          message: "The server took too long to respond.",
          requestId: request.headers.get(REQUEST_ID_HEADER) ?? undefined,
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCallerAbort);
    }
  };
}
