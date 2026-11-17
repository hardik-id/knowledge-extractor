"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { authClient } from "@/services";

// StrictMode runs effects twice in development; the answer may be handled once.
let started = false;

type Phase = "working" | "failed";

/**
 * The page Microsoft returns to. Hands the answer to the library, which stores
 * it and navigates back (or, in a sign-in window or hidden frame, passes it to
 * the opener and closes).
 */
export function RedirectBridge() {
  const [phase, setPhase] = useState<Phase>(authClient ? "working" : "failed");

  useEffect(() => {
    if (!authClient || started) return;
    started = true;
    void (async () => {
      try {
        const { broadcastResponseToMainFrame } =
          await import("@azure/msal-browser/redirect-bridge");
        await broadcastResponseToMainFrame();
      } catch {
        setPhase("failed");
      }
    })();
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      {phase === "working" ? (
        <p role="status" className="flex items-center gap-3 text-lg text-ink-muted">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Signing you in…
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p role="alert" className="flex items-center gap-2 text-lg text-ink">
            <CircleAlert aria-hidden className="size-5 text-danger" />
            Sign-in could not be completed.
          </p>
          <Link href="/" className="text-link underline underline-offset-4">
            Go to the start page
          </Link>
        </div>
      )}
    </main>
  );
}
