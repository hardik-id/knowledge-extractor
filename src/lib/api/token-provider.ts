/**
 * Where the HTTP client and the WebSocket get the access token from.
 * How the token is first obtained (this app's own login, or a hand-over from
 * the existing app) is decided elsewhere and plugged in through this interface.
 */
export interface TokenProvider {
  getAccessToken(): string | null | Promise<string | null>;
  /** Get a new access token. Resolves to null when the session can't be renewed. */
  refresh(): Promise<string | null>;
  /** Called when a request is still unauthorised after a refresh: send the person to sign in. */
  onUnauthenticated(): void;
}

export interface MemoryTokenProviderOptions {
  initialToken?: string | null;
  /** Calls the backend's refresh endpoint and returns the new access token. */
  refresh?: () => Promise<string | null>;
  onUnauthenticated?: () => void;
}

export interface MemoryTokenProvider extends TokenProvider {
  setAccessToken(token: string | null): void;
}

/** Keeps the access token in memory only, so it is never readable from storage. */
export function createMemoryTokenProvider({
  initialToken = null,
  refresh,
  onUnauthenticated,
}: MemoryTokenProviderOptions = {}): MemoryTokenProvider {
  let token = initialToken;
  return {
    getAccessToken: () => token,
    setAccessToken: (next) => {
      token = next;
    },
    refresh: async () => {
      token = refresh ? await refresh() : null;
      return token;
    },
    onUnauthenticated: () => {
      token = null;
      onUnauthenticated?.();
    },
  };
}
