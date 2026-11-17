import { env } from "@/config/env";
import { createMemoryTokenProvider, type TokenProvider } from "@/lib/api";
import { createAuthTokenProvider, lazyAuthClient } from "@/lib/auth";
import type { AuthClient } from "@/lib/auth/auth-client";
import type { AuthTokenProvider } from "@/lib/auth/auth-token-provider";

/**
 * Sign-in for the backend API, chosen by NEXT_PUBLIC_AUTH_MODE:
 * none   no sign-in; the dev token (if any) is sent
 * entra  Microsoft Entra ID through MSAL (loaded only when first used)
 * fake   a pretend person, for development; `window.__auth.expire()` ends the session
 */

declare global {
  interface Window {
    /** Fake sign-in only. `__auth.expire()` ends the session: token requests fail and the app is told. */
    __auth?: { expire(): void };
  }
}

function createAuthClient(): AuthClient | null {
  switch (env.authMode) {
    case "entra": {
      const settings = env.entra;
      if (!settings) return null;
      return lazyAuthClient(() =>
        import("@/lib/auth/msal-auth-client").then((m) => m.createMsalAuthClient(settings)),
      );
    }
    case "fake":
      return lazyAuthClient(() =>
        import("@/lib/auth/fake-auth-client").then((m) => {
          const client = m.createFakeAuthClient();
          if (typeof window !== "undefined") {
            window.__auth = {
              expire: () => {
                client.expire();
                // Say so at once. A real session is found to have ended at the next
                // refused call, and the mock backend makes no calls.
                authSession?.onUnauthenticated();
              },
            };
          }
          return client;
        }),
      );
    default:
      return null;
  }
}

export const authClient: AuthClient | null = createAuthClient();

export const authSession: AuthTokenProvider | null = authClient
  ? createAuthTokenProvider(authClient)
  : null;

/** What the API client sends as the bearer token. */
export const authTokens: TokenProvider =
  authSession ?? createMemoryTokenProvider({ initialToken: env.devAccessToken });
