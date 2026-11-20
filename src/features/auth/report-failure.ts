import { toast } from "sonner";
import { isUnauthorized } from "@/lib/api/api-error";
import { appSession } from "@/lib/auth/session-signal";
import { describeApiError, type ExtractionNoun } from "@/services/errors";

/**
 * True when a failure is the session having ended: the sign-in surface already
 * says so, once, so nothing else reports it.
 */
export function isSessionEnd(error: unknown): boolean {
  return isUnauthorized(error) && appSession.isEnded();
}

/** `toast.error` for a failed call, except when the session has ended (see `isSessionEnd`). */
export function toastFailure(title: string, error: unknown, noun?: ExtractionNoun): void {
  if (isSessionEnd(error)) return;
  toast.error(title, { description: describeApiError(error, noun) });
}
