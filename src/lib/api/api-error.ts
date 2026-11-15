/**
 * The one error type every backend call fails with.
 * `status` is the HTTP status, or 0 when no response arrived (network failure, timeout).
 * `code` is the backend's machine-readable code, or one of the client codes below.
 */
export type ClientErrorCode = "network_error" | "timeout";

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor({ status, code, message, details, requestId, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True when a request was cancelled by its caller (not a failure to report). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
