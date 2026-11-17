"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { initialAuthState, type AuthState } from "@/lib/auth/auth-state";
import { authController } from "./auth";

export interface AuthContextValue {
  state: AuthState;
  signIn: () => Promise<void>;
  signInAgain: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const noopSubscribe = () => () => {};
const getInitialState = () => initialAuthState;

/** Gives the tree the sign-in state and its actions; provides null when sign-in is off. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    authController ? authController.subscribe : noopSubscribe,
    authController ? authController.getState : getInitialState,
    getInitialState,
  );

  useEffect(() => {
    void authController?.start();
  }, []);

  const value = useMemo<AuthContextValue | null>(
    () =>
      authController
        ? {
            state,
            signIn: authController.signIn,
            signInAgain: authController.signInAgain,
            signOut: authController.signOut,
          }
        : null,
    [state],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

/** The sign-in state and actions, or null when sign-in is off. */
export function useAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
