import type { AuthAccount, AuthInitResult } from "./auth-client";

export type AuthStatus = "loading" | "signed-out" | "signed-in" | "session-ended" | "error";

export interface AuthState {
  status: AuthStatus;
  account: AuthAccount | null;
  /** A sentence for the person, set with the "error" status. */
  message: string | null;
}

export const initialAuthState: AuthState = { status: "loading", account: null, message: null };

/**
 * Go to the identity provider without a click, only when this tab has no
 * session and the person has not just signed out or tried and come back.
 */
export function shouldAutoSignIn(result: AuthInitResult, autoOff: boolean): boolean {
  return result.status === "signed-out" && !autoOff;
}

/** True when a different person than before is signed in. */
export function accountChanged(lastAccountId: string | null, account: AuthAccount): boolean {
  return lastAccountId !== null && lastAccountId !== account.id;
}

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const AUTO_OFF_KEY = "knowledge-apps:auth:no-auto";
const ACCOUNT_KEY = "knowledge-apps:auth:account";

/** Two small facts that survive a page reload. Missing or broken storage behaves as empty. */
export function createAuthFlags(storage: FlagStorage | null) {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string | null) => {
    try {
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      // Storage blocked or full: the flag is simply not kept.
    }
  };
  return {
    getAutoOff: () => read(AUTO_OFF_KEY) === "1",
    setAutoOff: (value: boolean) => write(AUTO_OFF_KEY, value ? "1" : null),
    getLastAccountId: () => read(ACCOUNT_KEY),
    setLastAccountId: (id: string | null) => write(ACCOUNT_KEY, id),
  };
}

export type AuthFlags = ReturnType<typeof createAuthFlags>;
