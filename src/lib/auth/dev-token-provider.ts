import type { AuthTokenProvider } from "./auth-token-provider";
import { appSession, type SessionSignal } from "./session-signal";

/** A token provider for mode `none`: the dev token, replaceable while the app runs. */
export interface DevTokenProvider extends AuthTokenProvider {
  /**
   * Uses this token from now on, and keeps it for the tab. Calls flow again at
   * once, but the session stays ended until `resume()`: the caller first checks
   * that the API accepts the token.
   */
  setAccessToken(token: string): void;
}

type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEV_TOKEN_KEY = "knowledge-apps:auth:dev-token";

/**
 * Whether the person may paste a dev token: mode `none`, never in a production
 * build. A production build against the real API refuses mode `none` anyway
 * (see `config/env.ts`); this keeps the paste-a-token surface out of one that
 * runs on the mock.
 */
export function devTokenAllowed(nodeEnv: string | undefined, authMode: string): boolean {
  return authMode === "none" && nodeEnv !== "production";
}

export interface DevTokenProviderOptions {
  /** The token the app was built with (`NEXT_PUBLIC_DEV_ACCESS_TOKEN`), used until one is pasted. */
  initialToken?: string | null;
  /**
   * Where a pasted token is kept so a reload of the tab does not ask again.
   * `sessionStorage` is acceptable here and only here: this is a local
   * development token (a production build against the real API refuses mode
   * `none`, and `devTokenAllowed` is false in one), it dies with the tab, and
   * the built-in one is already in the browser bundle. Real sign-in tokens
   * never come near this file. `null` keeps nothing.
   */
  storage?: TokenStorage | null;
  session?: SessionSignal;
}

function read(storage: TokenStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

export function createDevTokenProvider({
  initialToken = null,
  storage = null,
  session = appSession,
}: DevTokenProviderOptions = {}): DevTokenProvider {
  // A pasted token wins over the one built in: that one is the one that was refused.
  let token = read(storage, DEV_TOKEN_KEY) ?? initialToken;
  let ended = false;
  const listeners = new Set<() => void>();

  return {
    getAccessToken: () => (ended ? null : token),
    // There is nothing to renew a dev token with.
    refresh: async () => null,
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
    setAccessToken: (next) => {
      token = next;
      ended = false;
      try {
        storage?.setItem(DEV_TOKEN_KEY, next);
      } catch {
        // Storage blocked or full: the token lasts until the page goes.
      }
    },
    resume: () => {
      ended = false;
      session.resume();
    },
  };
}
