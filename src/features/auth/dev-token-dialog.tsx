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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isUnauthorized } from "@/lib/api/api-error";
import type { DevTokenProvider } from "@/lib/auth";
import { services } from "@/services";
import { describeApiError } from "@/services/errors";

/** `make token` prints the bare token; accept it pasted with a "Bearer " in front, or with spaces around. */
export function cleanPastedToken(text: string): string {
  return text.trim().replace(/^Bearer\s+/i, "");
}

/**
 * Development only (mode `none`): where the person pastes a new dev token when the
 * API no longer accepts the one the app has. Same place and style as the
 * session-ended dialog of the real sign-in modes. It is loaded only when
 * `process.env.NODE_ENV` is not "production" (see `auth-gate.tsx`), so a production
 * build does not contain it.
 *
 * The token is used at once and kept for the tab (`DevTokenProvider`). The dialog
 * stays until the API has accepted it, and says so if it is refused as well.
 */
export default function DevTokenDialog({ tokens }: { tokens: DevTokenProvider }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = cleanPastedToken(text);
    if (!token || busy) return;
    setBusy(true);
    setFailure(null);
    tokens.setAccessToken(token);
    try {
      // Any call will do: the API answers 401 to a token it does not accept.
      await services.workspaces.listPage();
      setText("");
      tokens.resume();
    } catch (error) {
      setFailure(
        isUnauthorized(error)
          ? "The server refused this token as well. Run make token again and paste the whole line."
          : describeApiError(error),
      );
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
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>The access token is no longer accepted</DialogTitle>
            <DialogDescription>
              Run <code>make token</code> in the backend repository (knowledge-extractor-api) and
              paste the new token here. Your work on this page is kept.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-token">Access token</Label>
            <Input
              id="dev-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={text}
              disabled={busy}
              aria-invalid={failure ? true : undefined}
              aria-describedby={failure ? "dev-token-error" : undefined}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {failure && (
            <p
              id="dev-token-error"
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-[15px] leading-[22px] text-ink"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
              <span>{failure}</span>
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={busy || cleanPastedToken(text) === ""}>
              {busy && <LoaderCircle aria-hidden className="animate-spin" />}
              {busy ? "Checking…" : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
