import { newId } from "@/lib/id";
import type { Middleware } from "../http-client";

export const REQUEST_ID_HEADER = "X-Request-ID";

/** Tags each call so a failure seen in the UI can be found in the backend logs. */
export function requestIdMiddleware(): Middleware {
  return (request, next) => {
    if (!request.headers.has(REQUEST_ID_HEADER)) request.headers.set(REQUEST_ID_HEADER, newId());
    return next(request);
  };
}
