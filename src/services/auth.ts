import { env } from "@/config/env";
import { createMemoryTokenProvider, type TokenProvider } from "@/lib/api";
import {
  createAuthTokenProvider,
  createDevTokenProvider,
  devTokenAllowed,
  lazyAuthClient,
  type DevTokenProvider,
} from "@/lib/auth";
import type { AuthClient } from "@/lib/auth/auth-client";
import type { AuthTokenProvider } from "@/lib/auth/auth-token-provider";

/**
 * Sign-in for the backend API, chosen by NEXT_PUBLIC_AUTH_MODE:
 * none   no sign-in; the dev token (if any) is sent. When the API refuses it, a development
 *        build asks for a new one (`features/auth/dev-token-dialog.tsx`)
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

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Mode `none`, development only: the dev token, which a person can replace by pasting
 * a new one when the API stops accepting it. Null in every other mode and in a production
 * build, where `authTokens` is a plain in-memory token that nothing can replace.
 */
export const devTokens: DevTokenProvider | null =
  !authSession && devTokenAllowed(process.env.NODE_ENV, env.authMode)
    ? createDevTokenProvider({
        initialToken: env.devAccessToken,
        storage: sessionStorageOrNull(),
      })
    : null;

/** What the API client sends as the bearer token. */
export const authTokens: TokenProvider =
  authSession ?? devTokens ?? createMemoryTokenProvider({ initialToken: env.devAccessToken });
