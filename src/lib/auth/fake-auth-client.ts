import type { AuthAccount, AuthClient } from "./auth-client";

type FakeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface FakeAuthClientOptions {
  /** Default: sessionStorage (resolved when used). `null` keeps nothing. */
  storage?: FakeStorage | null;
  /** Default: `location.reload()` and `(location.href = "/")`. */
  navigate?: (to: "reload" | "home") => void;
}

export const FAKE_ACCOUNT: AuthAccount = {
  id: "fake-tenant.fake-ada",
  name: "Ada Lovelace",
  username: "ada@example.com",
};

const ACCOUNT_KEY = "knowledge-apps:auth:fake-account";
const CHANNEL = "knowledge-apps:auth";
export const FAKE_ACCESS_TOKEN = "fake-access-token";

/** A pretend identity provider for development and tests. `expire()` ends the session's tokens. */
export function createFakeAuthClient(
  options: FakeAuthClientOptions = {},
): AuthClient & { expire(): void } {
  let expired = false;
  /** True once this tab has started signing out: it must not react to its own announcement. */
  let signingOut = false;

  const storage = (): FakeStorage | null => {
    if (options.storage !== undefined) return options.storage;
    try {
      return typeof sessionStorage === "undefined" ? null : sessionStorage;
    } catch {
      return null;
    }
  };
  const navigate = (to: "reload" | "home") => {
    if (options.navigate) options.navigate(to);
    else if (to === "reload") location.reload();
    // A full page load is wanted here, not a client-side route change.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    else location.assign("/");
  };
  const stored = (): boolean => {
    try {
      return storage()?.getItem(ACCOUNT_KEY) != null;
    } catch {
      return false;
    }
  };
  const store = () => {
    try {
      storage()?.setItem(ACCOUNT_KEY, JSON.stringify(FAKE_ACCOUNT));
    } catch {
      // Storage blocked: the pretend session lasts until the page goes.
    }
  };

  return {
    init: async () =>
      stored() ? { status: "signed-in", account: FAKE_ACCOUNT } : { status: "signed-out" },
    signIn: async () => {
      expired = false;
      store();
      navigate("reload");
    },
    signInAgain: async () => {
      expired = false;
      store();
      return FAKE_ACCOUNT;
    },
    signOut: async () => {
      signingOut = true;
      try {
        storage()?.removeItem(ACCOUNT_KEY);
      } catch {
        // Nothing to remove.
      }
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(CHANNEL);
        channel.postMessage("signed-out");
        channel.close();
      }
      navigate("home");
    },
    getAccessToken: async () => (expired ? null : FAKE_ACCESS_TOKEN),
    onSignedOutElsewhere: (listener) => {
      if (typeof BroadcastChannel === "undefined") return () => {};
      const channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => {
        // A channel also hears the other channels of its own tab.
        if (signingOut) return;
        try {
          storage()?.removeItem(ACCOUNT_KEY);
        } catch {
          // Nothing to remove.
        }
        listener();
      };
      return () => channel.close();
    },
    expire: () => {
      expired = true;
    },
  };
}
