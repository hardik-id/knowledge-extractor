import type { TokenProvider } from "@/lib/api/token-provider";
import type { AuthClient } from "./auth-client";
import { appSession, type SessionSignal } from "./session-signal";

export interface AuthTokenProvider extends TokenProvider {
  /** Called when the session has ended (once, until `resume()`). */
  subscribe(listener: () => void): () => void;
  /** The person signed in again: tokens flow and a new end is reported again. */
  resume(): void;
}

/**
 * The token source for the API client, backed by the sign-in client. Once the
 * session has ended it hands out nothing and asks nothing, so a backend that
 * keeps answering 401 does not cause a token request per call. It also tells
 * the app's session signal, which quiets the pages and the socket.
 */
export function createAuthTokenProvider(
  client: AuthClient,
  session: SessionSignal = appSession,
): AuthTokenProvider {
  let ended = false;
  const listeners = new Set<() => void>();

  return {
    getAccessToken: async () => (ended ? null : client.getAccessToken()),
    refresh: async () => (ended ? null : client.getAccessToken({ forceRefresh: true })),
    onUnauthenticated: () => {
      if (ended) return;
      ended = true;
      session.end();
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resume: () => {
      ended = false;
      session.resume();
    },
  };
}
