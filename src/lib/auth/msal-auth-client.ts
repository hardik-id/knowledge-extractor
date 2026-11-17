import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import {
  SignInWindowError,
  type AuthAccount,
  type AuthClient,
  type AuthInitResult,
} from "./auth-client";

export interface MsalSettings {
  tenantId: string;
  clientId: string;
  apiScope: string;
}

type Msal = typeof import("@azure/msal-browser");

const CHANNEL = "knowledge-apps:auth";

/** Errors from a silent request that mean "the person has to sign in again" (codes in msal-browser's BrowserAuthErrorCodes). */
const SIGN_IN_AGAIN_CODES = new Set([
  "timed_out", // the hidden frame never answered (subError monitor_window_timeout)
  "iframe_closed_prematurely",
  "empty_response",
  "redirect_bridge_empty_response",
  "block_iframe_reload",
]);

/** Errors that mean the popup could not be used or was closed. */
const POPUP_FAILED_CODES = new Set([
  "popup_window_error",
  "empty_window_error",
  "user_cancelled",
  "timed_out",
  "redirect_bridge_empty_response",
]);

const errorCode = (error: unknown): string | null =>
  typeof error === "object" && error !== null && "errorCode" in error
    ? String((error as { errorCode: unknown }).errorCode)
    : null;

function toAccount(info: AccountInfo): AuthAccount {
  return {
    id: `${info.tenantId}.${info.localAccountId}`,
    name: info.name || info.username,
    username: info.username,
  };
}

/** A sentence a person can read, with the code kept for support. */
function signInErrorMessage(error: unknown): string {
  const code = errorCode(error);
  const suffix = code ? ` (${code})` : "";
  switch (code) {
    case "user_cancelled":
      return `Sign-in was cancelled${suffix}.`;
    case "access_denied":
    case "consent_required":
      return `Microsoft did not allow this sign-in. Ask an administrator for access${suffix}.`;
    case "interaction_in_progress":
      return `Another sign-in is already running. Close it and try again${suffix}.`;
    case "redirect_bridge_empty_response":
    case "empty_response":
      return `Microsoft sent no answer to the sign-in. Try again${suffix}.`;
    default:
      return `Sign-in did not finish${suffix}. Try again, and if it keeps failing, tell your administrator.`;
  }
}

export function createMsalAuthClient(settings: MsalSettings): AuthClient {
  const scopes = [settings.apiScope];
  let loaded: Promise<{ msal: Msal; app: IPublicClientApplication }> | null = null;
  let account: AccountInfo | null = null;
  /** True once this tab has started signing out: it must not react to its own announcement. */
  let signingOut = false;

  const load = () =>
    (loaded ??= (async () => {
      const msal = await import("@azure/msal-browser");
      const app = new msal.PublicClientApplication({
        auth: {
          clientId: settings.clientId,
          authority: `https://login.microsoftonline.com/${settings.tenantId}`,
          redirectUri: `${location.origin}/auth/redirect`,
          postLogoutRedirectUri: `${location.origin}/`,
        },
      });
      return { msal, app };
    })());

  const clearCacheFor = async (info: AccountInfo | null) => {
    if (!info) return;
    const { app } = await load();
    await app.clearCache({ account: info });
  };

  return {
    init: async (): Promise<AuthInitResult> => {
      try {
        const { app } = await load();
        await app.initialize();
        const result = await app.handleRedirectPromise();
        let found: AccountInfo | null = result?.account ?? null;
        if (found) app.setActiveAccount(found);
        found ??= app.getActiveAccount();
        if (!found) {
          const all = app.getAllAccounts();
          if (all.length === 1) {
            found = all[0];
            app.setActiveAccount(found);
          }
        }
        account = found;
        return found
          ? { status: "signed-in", account: toAccount(found) }
          : { status: "signed-out" };
      } catch (error) {
        return { status: "error", message: signInErrorMessage(error) };
      }
    },

    signIn: async () => {
      const { app } = await load();
      await app.loginRedirect({ scopes });
    },

    signInAgain: async () => {
      const { app } = await load();
      try {
        const result = await app.acquireTokenPopup({ scopes, account: account ?? undefined });
        if (!result?.account) throw new SignInWindowError();
        account = result.account;
        app.setActiveAccount(account);
        return toAccount(account);
      } catch (error) {
        if (error instanceof SignInWindowError) throw error;
        const code = errorCode(error);
        if (code && POPUP_FAILED_CODES.has(code)) throw new SignInWindowError();
        throw error;
      }
    },

    signOut: async () => {
      const { app } = await load();
      signingOut = true;
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(CHANNEL);
        channel.postMessage("signed-out");
        channel.close();
      }
      await app.logoutRedirect({ account: account ?? undefined });
    },

    getAccessToken: async ({ forceRefresh = false } = {}) => {
      if (!account) return null;
      const { msal, app } = await load();
      try {
        const result = await app.acquireTokenSilent({ scopes, account, forceRefresh });
        return result.accessToken || null;
      } catch (error) {
        const code = errorCode(error);
        if (
          error instanceof msal.InteractionRequiredAuthError ||
          (code !== null && SIGN_IN_AGAIN_CODES.has(code))
        ) {
          return null;
        }
        throw error;
      }
    },

    onSignedOutElsewhere: (listener) => {
      if (typeof BroadcastChannel === "undefined") return () => {};
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => {
        // A channel also hears the other channels of its own tab.
        if (signingOut) return;
        // Clear this tab's copy without navigating; the other tab is leaving the identity provider.
        void (async () => {
          try {
            await clearCacheFor(account);
          } catch {
            // The session is over either way.
          }
          account = null;
          listener();
        })();
      };
      return () => channel.close();
    },
  };
}
