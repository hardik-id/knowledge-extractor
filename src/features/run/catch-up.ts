import { services } from "@/services";
import {
  assistantActivity,
  mergeAssistantMessages,
} from "@/features/extraction/assistant-activity";
import type { RunStore } from "@/store/pipeline-store";
import type { PipelineState } from "@/store/types";
import type { ConnectionState } from "@/services/contracts";

/** While live updates are down, the API is asked this often. */
export const CATCH_UP_INTERVAL_MS = 4000;

type Watched = Pick<PipelineState, "connection" | "cells" | "startingStages" | "assistantMessages">;

/** A stage is going (starting, queued or running), or a reply is awaited or being written. */
export function somethingInProgress(s: Omit<Watched, "connection">): boolean {
  if (s.startingStages.length > 0) return true;
  if (assistantActivity(s.assistantMessages) !== "idle") return true;
  return Object.values(s.cells).some((byStage) =>
    Object.values(byStage).some((c) => c?.status === "queued" || c?.status === "running"),
  );
}

/** Ask the API on a timer only when the socket cannot deliver and there is something to wait for. */
export function shouldPoll(s: Watched): boolean {
  const down: ConnectionState[] = ["reconnecting", "closed"];
  return down.includes(s.connection) && somethingInProgress(s);
}

/** The conversation, fetched again and joined with what the store already has. */
export async function refreshAssistant(runStore: RunStore, runId: string, signal?: AbortSignal) {
  try {
    const loaded = await services.extraction.getAssistantMessages(runId, signal);
    const s = runStore.getState();
    if (signal?.aborted || s.runId !== runId) return;
    const merged = mergeAssistantMessages(s.assistantMessages, loaded);
    // Unchanged: leave the store alone, so nothing that reads the conversation renders again.
    if (JSON.stringify(merged) !== JSON.stringify(s.assistantMessages)) {
      s.setAssistantMessages(merged);
    }
  } catch {
    // The next round asks again.
  }
}

/**
 * Polls `catchUp` every `intervalMs` while `shouldPoll` holds for the store, and not otherwise.
 * One round at a time. Returns the function that stops it.
 */
export function watchCatchUp(
  runStore: RunStore,
  catchUp: () => Promise<void>,
  intervalMs = CATCH_UP_INTERVAL_MS,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let stopped = false;
  const round = async () => {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      await catchUp();
    } finally {
      inFlight = false;
    }
  };
  const sync = () => {
    const wanted = !stopped && shouldPoll(runStore.getState());
    if (wanted && !timer) timer = setInterval(() => void round(), intervalMs);
    else if (!wanted && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  const unsubscribe = runStore.subscribe(sync);
  sync();
  return () => {
    stopped = true;
    unsubscribe();
    if (timer) clearInterval(timer);
    timer = null;
  };
}
