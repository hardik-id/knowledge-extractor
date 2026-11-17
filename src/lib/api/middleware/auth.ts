import type { ApiRequest, Middleware } from "../http-client";
import type { TokenProvider } from "../token-provider";

function withToken(request: ApiRequest, token: string | null): ApiRequest {
  const headers = new Headers(request.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  return { ...request, headers };
}

/**
 * Adds the bearer token. On a 401 it refreshes the token once and sends the
 * request again. Calls that fail at the same time share one refresh.
 *
 * Only a refresh that resolves to null means the session is over
 * (`onUnauthenticated`). A token source that throws (the network is down)
 * fails the request with that error and signs nobody out.
 */
export function authMiddleware(tokens: TokenProvider): Middleware {
  let refreshing: Promise<string | null> | null = null;

  const refreshOnce = () => {
    refreshing ??= tokens.refresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  return async (request, next) => {
    const used = await tokens.getAccessToken();
    const response = await next(withToken(request, used));
    if (response.status !== 401) return response;

    // Another call may have refreshed the token while this one was in flight.
    const current = await tokens.getAccessToken();
    const fresh = current && current !== used ? current : await refreshOnce();
    if (!fresh) {
      tokens.onUnauthenticated();
      return response;
    }

    const retried = await next(withToken(request, fresh));
    if (retried.status === 401) tokens.onUnauthenticated();
    return retried;
  };
}
