import { ApiError, isAbortError, isApiError } from "../api-error";
import type { Middleware } from "../http-client";
import { REQUEST_ID_HEADER } from "./request-id";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the backend's error body. Accepts `{ code, message, details }` and
 * Django REST Framework's `{ detail }`; anything else is kept as `details`.
 */
async function toApiError(response: Response, requestId: string | undefined): Promise<ApiError> {
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const record = isRecord(body) ? body : {};
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.detail === "string"
        ? record.detail
        : response.statusText || `Request failed with status ${response.status}`;

  return new ApiError({
    status: response.status,
    code: typeof record.code === "string" ? record.code : `http_${response.status}`,
    message,
    details: "details" in record ? record.details : body,
    requestId: response.headers.get(REQUEST_ID_HEADER) ?? requestId,
  });
}

/**
 * Makes every failure an ApiError: a non-2xx response, or no response at all.
 * A call cancelled by its caller keeps its AbortError.
 * Put this first (outermost) so the other middleware can still see raw responses.
 */
export function errorMiddleware(): Middleware {
  return async (request, next) => {
    const requestId = () => request.headers.get(REQUEST_ID_HEADER) ?? undefined;

    let response: Response;
    try {
      response = await next(request);
    } catch (error) {
      if (isApiError(error) || isAbortError(error) || request.signal?.aborted) throw error;
      throw new ApiError({
        status: 0,
        code: "network_error",
        message: "Could not reach the server. Check your connection.",
        requestId: requestId(),
        cause: error,
      });
    }

    if (response.ok || response.status === 304) return response;
    throw await toApiError(response, requestId());
  };
}
