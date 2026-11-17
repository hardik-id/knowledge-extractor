"use client";

import { useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignInWindowError } from "@/lib/auth/auth-client";
import { useAuth } from "./auth-provider";

type Failure = "window" | "other" | null;

/** Over the page when the session ends. It cannot be dismissed: only signing in again closes it. */
export function SessionEndedDialog() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  if (!auth) return null;

  const signInAgain = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await auth.signInAgain();
    } catch (error) {
      setFailure(error instanceof SignInWindowError ? "window" : "other");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Your session has ended</DialogTitle>
          <DialogDescription>
            Sign in again to continue. Your work on this page is kept.
          </DialogDescription>
        </DialogHeader>

        {failure && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-[15px] leading-[22px] text-ink"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
            <span>
              {failure === "window"
                ? "The sign-in window was blocked or closed."
                : "Sign-in failed. Try again."}
            </span>
          </p>
        )}

        <DialogFooter>
          {failure === "window" && (
            <div className="flex flex-col gap-2 sm:mr-auto sm:max-w-56">
              <Button variant="outline" onClick={() => void auth.signIn()}>
                Sign in on this page
              </Button>
              <p className="text-[15px] leading-[22px] text-ink-muted">
                Unsaved changes on this page will be lost.
              </p>
            </div>
          )}
          <Button onClick={() => void signInAgain()} disabled={busy} className="sm:self-start">
            {busy && <LoaderCircle aria-hidden className="animate-spin" />}
            {busy ? "Waiting for sign-in…" : "Sign in again"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
