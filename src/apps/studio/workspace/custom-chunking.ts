import { isApiError } from "@/lib/api/api-error";
import type {
  CustomChunking,
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

/** What the person typed, kept so it outlives switching to another strategy and back. */
export interface CustomWords {
  instruction: string;
  sourceUrl: string;
  /** The applied code these words were typed against: words typed against other code are not kept. */
  forCode: string | null;
}

/**
 * What the Chunking row remembers while the screen is open, for one run: the typed words, and
 * the code last applied, so choosing another strategy and coming back doesn't cost a new Generate.
 * Never saved: the wire form of another strategy stays `custom: null`.
 */
export interface CustomMemory {
  runId: string | null;
  words: CustomWords | null;
  applied: CustomChunking | null;
}

export const NO_MEMORY: CustomMemory = { runId: null, words: null, applied: null };

/** The memory as it is for this run: empty when it was made in another project. */
export function memoryFor(memory: CustomMemory, runId: string | null): CustomMemory {
  return memory.runId === runId ? memory : { ...NO_MEMORY, runId };
}

export function rememberWords(
  memory: CustomMemory,
  runId: string | null,
  words: CustomWords,
): CustomMemory {
  return { ...memoryFor(memory, runId), words };
}

export function rememberApplied(
  memory: CustomMemory,
  runId: string | null,
  applied: CustomChunking,
): CustomMemory {
  return { ...memoryFor(memory, runId), applied };
}

/** The words for a finished Generate, for the status line read out to a screen reader. */
export function resultAnnouncement(documents: number): string {
  return `Code written, ${documents} ${documents === 1 ? "document" : "documents"} checked`;
}
