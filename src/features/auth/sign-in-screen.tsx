"use client";

import { CircleAlert, LogIn } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "./auth-provider";

/** Shown when nobody is signed in, or the last attempt failed. */
export function SignInScreen() {
  const auth = useAuth();
  if (!auth) return null;
  const { state, signIn } = auth;

  return (
    <div className="relative grid min-h-dvh place-items-center bg-background px-4 py-16">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <main className="flex w-full max-w-md flex-col gap-6 rounded-xl border-2 border-border-subtle bg-surface-raised p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl leading-9 font-bold text-ink-heading">Knowledge apps</h1>
          <p className="text-base leading-6 text-ink-muted">
            Sign in with your Microsoft work account.
          </p>
        </div>
        {state.status === "error" && (
          <Alert className="rounded-md border-transparent bg-danger-soft p-4 text-ink">
            <CircleAlert aria-hidden className="size-5 text-danger" />
            <AlertTitle className="font-semibold">Sign-in failed</AlertTitle>
            <AlertDescription className="text-[15px] leading-[22px] text-ink">
              {state.message}
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={() => void signIn()} className="w-full">
          <LogIn aria-hidden />
          Sign in with Microsoft
        </Button>
      </main>
    </div>
  );
}
