"use client";

import { LoaderCircle } from "lucide-react";
import { authController } from "./auth";
import { useAuth } from "./auth-provider";
import { SessionEndedDialog } from "./session-ended-dialog";
import { SignInScreen } from "./sign-in-screen";

/**
 * Lets the app mount only for a signed-in person. Without sign-in (mode none)
 * it renders its children as they are.
 *
 * `children` sit at the same position for "signed-in" and "session-ended", so
 * the session ending never remounts the page and its unsaved work.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!authController || !auth) return <>{children}</>;

  const { status } = auth.state;
  if (status === "loading") return <CheckingSignIn />;
  if (status === "signed-out" || status === "error") return <SignInScreen />;

  return (
    <>
      {children}
      {status === "session-ended" && <SessionEndedDialog />}
    </>
  );
}

function CheckingSignIn() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <p role="status" className="flex items-center gap-3 text-lg text-ink-muted">
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
        Checking sign-in…
      </p>
    </div>
  );
}
