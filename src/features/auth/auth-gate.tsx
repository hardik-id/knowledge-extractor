"use client";

import { lazy, Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { devTokens } from "@/services";
import { authController } from "./auth";
import { useAuth } from "./auth-provider";
import { SessionEndedDialog } from "./session-ended-dialog";
import { SignInScreen } from "./sign-in-screen";
import { useSessionEnded } from "./use-session";

/**
 * Mode `none` has no sign-in, so a refused dev token is answered with a dialog to paste a
 * new one. That is for development only: the condition is a literal the bundler folds, so a
 * production build drops the `import()` and the dialog's chunk is never made.
 */
const DevTokenDialog =
  process.env.NODE_ENV === "production" ? null : lazy(() => import("./dev-token-dialog"));

/**
 * Lets the app mount only for a signed-in person. Without sign-in (mode none)
 * it renders its children as they are.
 *
 * `children` sit at the same position for "signed-in" and "session-ended", so
 * the session ending never remounts the page and its unsaved work.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const sessionEnded = useSessionEnded();
  if (!authController || !auth) {
    return (
      <>
        {children}
        {DevTokenDialog && devTokens && sessionEnded && (
          <Suspense>
            <DevTokenDialog tokens={devTokens} />
          </Suspense>
        )}
      </>
    );
  }

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
