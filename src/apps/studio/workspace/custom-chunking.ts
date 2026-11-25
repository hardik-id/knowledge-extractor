import { isApiError } from "@/lib/api/api-error";
import type {
  CustomChunkingRequest,
  CustomChunkingResult,
  ExtractionApi,
} from "@/services/contracts";
import { describeApiError } from "@/services/errors";

/** What Generate ends in: the code and its checks, the server's words, or nothing (it was abandoned). */
export type GenerateOutcome =
  | { kind: "result"; result: CustomChunkingResult }
  | { kind: "error"; message: string }
  | { kind: "abandoned" };

/**
 * The server's own words for a failed Generate. Its answers about custom chunking and a refused
 * link are written for the person, so they are shown as sent (the generic wording would hide
 * them behind "the server ran into a problem" for a 504); everything else goes through
 * `describeApiError`.
 */
export function describeGenerateError(error: unknown): string {
  if (!isApiError(error)) return describeApiError(error);
  if (error.code.startsWith("custom_chunking")) return error.message;
  const errors = (error.details as { errors?: unknown } | undefined)?.errors;
  if (error.status === 422 && Array.isArray(errors)) {
    const messages = errors.flatMap((item) => {
      const { path, message } = (item ?? {}) as { path?: unknown; message?: unknown };
      if (typeof message !== "string") return [];
      return [path === "source_url" ? `Reference link: ${message}` : message];
    });
    if (messages.length > 0) return messages.join(" ");
  }
  if (error.status === 409 || error.status === 422 || error.status === 502) return error.message;
  return describeApiError(error);
}

/**
 * One Generate call. Resolves, never rejects. A call whose `signal` was aborted is "abandoned"
 * whatever the server answered, so a late answer can't land in a project the person has left.
 */
export async function generateSplitter(
  api: Pick<ExtractionApi, "generateCustomChunking">,
  runId: string,
  request: CustomChunkingRequest,
  signal: AbortSignal,
  isSessionEnd: (error: unknown) => boolean = () => false,
): Promise<GenerateOutcome> {
  try {
    const result = await api.generateCustomChunking(runId, request, signal);
    return signal.aborted ? { kind: "abandoned" } : { kind: "result", result };
  } catch (error) {
    // A session that ended is reported once for the whole app, not here.
    if (signal.aborted || isSessionEnd(error)) return { kind: "abandoned" };
    return { kind: "error", message: describeGenerateError(error) };
  }
}

/** Parts shown per document before "and N more". */
export const PARTS_SHOWN = 200;

export function partsLabel(count: number): string {
  return `${count} ${count === 1 ? "part" : "parts"}`;
}

/** Size of a part in characters. */
export function partSize(part: { start: number; end: number }): number {
  return part.end - part.start;
}

export const STALE_HINT = "The description changed since this code was generated.";
export const STALE_SIZE_HINT = "The size changed since this code was generated.";
