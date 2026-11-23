import { services } from "@/services";
import {
  assistantActivity,
  createAwaitedTracker,
  mergeAssistantMessages,
  type AwaitedTracker,
} from "@/features/extraction/assistant-activity";
import type { RunStore } from "@/store/pipeline-store";
import type { PipelineState } from "@/store/types";
import type { ConnectionState } from "@/services/contracts";

/** While live updates are down, the API is asked this often. */
export const CATCH_UP_INTERVAL_MS = 4000;

type Watched = Pick<PipelineState, "connection" | "cells" | "startingStages" | "assistantMessages">;

/** While a reply is awaited or being written, the API is asked this often whatever the connection
 * (the ask is what lets the server close a reply whose worker died). */
export const SLOW_REFRESH_INTERVAL_MS = 15_000;

/** A stage is going (starting, queued or running), or a reply is awaited or being written. */
export function somethingInProgress(
  s: Omit<Watched, "connection">,
  awaitedExpired = false,
): boolean {
  if (s.startingStages.length > 0) return true;
  if (assistantActivity(s.assistantMessages, false, awaitedExpired) !== "idle") return true;
  return Object.values(s.cells).some((byStage) =>
    Object.values(byStage).some((c) => c?.status === "queued" || c?.status === "running"),
  );
}

/** Ask the API on a timer only when the socket cannot deliver and there is something to wait for. */
export function shouldPoll(s: Watched, awaitedExpired = false): boolean {
  return connectionDown(s.connection) && somethingInProgress(s, awaitedExpired);
}

function connectionDown(connection: ConnectionState): boolean {
  return connection === "reconnecting" || connection === "closed";
}

/** The conversation is asked for every 15 s while its reply is awaited or written, unless the
 * connection is down (then the 4 s polling already asks). */
export function shouldRefreshSlowly(s: Watched, awaitedExpired = false): boolean {
  if (connectionDown(s.connection)) return false;
  return assistantActivity(s.assistantMessages, false, awaitedExpired) !== "idle";
}

/** Refreshes the conversation on a slow timer while `shouldRefreshSlowly` holds. One at a time.
 * Returns the function that stops it. */
export function watchSlowRefresh(
  runStore: RunStore,
  refresh: () => Promise<void>,
  tracker: AwaitedTracker = createAwaitedTracker(),
  intervalMs = SLOW_REFRESH_INTERVAL_MS,
): () => void {
  let inFlight = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const wantedNow = () => {
    const s = runStore.getState();
    return !stopped && shouldRefreshSlowly(s, tracker.expired(s.assistantMessages));
  };
  const sync = () => {
    const wanted = wantedNow();
    if (wanted && !timer) {
      timer = setInterval(() => {
        sync(); // the awaited wait may have expired meanwhile
        if (!timer || inFlight) return;
        inFlight = true;
        void refresh().finally(() => {
          inFlight = false;
        });
      }, intervalMs);
    } else if (!wanted && timer) {
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
  tracker: AwaitedTracker = createAwaitedTracker(),
): () => void {
  const wantedNow = () => {
    const s = runStore.getState();
    return shouldPoll(s, tracker.expired(s.assistantMessages));
  };
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
    const wanted = !stopped && wantedNow();
    if (wanted && !timer) {
      timer = setInterval(() => {
        sync(); // the awaited wait may have expired meanwhile
        if (timer) void round();
      }, intervalMs);
    } else if (!wanted && timer) {
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
