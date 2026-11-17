import type { AuthAccount, AuthClient } from "./auth-client";
import {
  accountChanged,
  initialAuthState,
  shouldAutoSignIn,
  type AuthFlags,
  type AuthState,
} from "./auth-state";
import type { AuthTokenProvider } from "./auth-token-provider";

export interface AuthController {
  /** The same object until something changes (for useSyncExternalStore). */
  getState(): AuthState;
  subscribe(listener: () => void): () => void;
  /** Idempotent: the first call does the work, later calls return the same promise. */
  start(): Promise<void>;
  /** The button on the sign-in screen. */
  signIn(): Promise<void>;
  /** The session-ended dialog. Rejects when the sign-in window fails; the state stays "session-ended". */
  signInAgain(): Promise<void>;
  signOut(): Promise<void>;
}

export interface AuthControllerOptions {
  client: AuthClient;
  tokens: AuthTokenProvider;
  flags: AuthFlags;
  /** Removes the previous person's local data (runs and so on). */
  clearData: () => void;
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createAuthController({
  client,
  tokens,
  flags,
  clearData,
}: AuthControllerOptions): AuthController {
  let state = initialAuthState;
  const listeners = new Set<() => void>();
  let started: Promise<void> | null = null;

  const set = (next: Partial<AuthState> & Pick<AuthState, "status">) => {
    const merged: AuthState = { account: null, message: null, ...next };
    if (
      merged.status === state.status &&
      merged.account === state.account &&
      merged.message === state.message
    ) {
      return;
    }
    state = merged;
    for (const listener of [...listeners]) listener();
  };

  const acceptAccount = (account: AuthAccount, changed: boolean) => {
    if (changed) clearData();
    flags.setLastAccountId(account.id);
    flags.setAutoOff(false);
    tokens.resume();
    set({ status: "signed-in", account });
  };

  const leaveForSignIn = async () => {
    set({ status: "loading" });
    try {
      await client.signIn();
    } catch (error) {
      set({ status: "error", message: describe(error, "Sign-in could not start.") });
    }
  };

  const run = async () => {
    tokens.subscribe(() => {
      if (state.status === "signed-in") set({ status: "session-ended", account: state.account });
    });
    client.onSignedOutElsewhere(() => {
      clearData();
      flags.setAutoOff(true);
      flags.setLastAccountId(null);
      set({ status: "signed-out" });
    });

    const result = await client.init();
    if (result.status === "signed-in") {
      acceptAccount(result.account, accountChanged(flags.getLastAccountId(), result.account));
    } else if (result.status === "signed-out") {
      if (shouldAutoSignIn(result, flags.getAutoOff())) {
        flags.setAutoOff(true); // before leaving, so coming back signed-out does not loop
        await leaveForSignIn();
      } else {
        set({ status: "signed-out" });
      }
    } else {
      set({ status: "error", message: result.message });
    }
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => (started ??= run()),
    signIn: async () => {
      flags.setAutoOff(true);
      await leaveForSignIn();
    },
    signInAgain: async () => {
      const account = await client.signInAgain();
      acceptAccount(account, state.account !== null && state.account.id !== account.id);
    },
    signOut: async () => {
      flags.setAutoOff(true);
      flags.setLastAccountId(null);
      clearData();
      await client.signOut();
    },
  };
}
