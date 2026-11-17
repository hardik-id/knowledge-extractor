import { services } from "@/services";
import type { StageCell } from "@/services/contracts";
import type { RunStore } from "@/store/pipeline-store";

/** Live updates are applied in batches, so a burst of them is one render, not hundreds. */
const CELL_BATCH_MS = 50;

export interface AttachRunOptions {
  /** The server no longer has the run. The store has already let go of it. */
  onGone: () => void;
}

/**
 * Keeps the store in step with one run on the server until the returned
 * function is called. It holds the live connection, and fetches the snapshot
 * every time that connection opens, because updates sent while it was down
 * are gone. No React: <RunSync> calls this for the current run of its store.
 */
export function attachRun(
  runStore: RunStore,
  runId: string,
  { onGone }: AttachRunOptions,
): () => void {
  const store = runStore.getState;
  const controller = new AbortController();

  const load = async () => {
    if ((await store().loadRun(controller.signal)) === "gone") onGone();
  };

  let batch: StageCell[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const cells = batch;
    batch = [];
    if (store().runId === runId) store().applyCells(cells);
  };

  // A run created a moment ago already has its snapshot. One found after a reload doesn't.
  if (store().runLoad !== "ready") void load();

  const unsubscribe = services.events.subscribe(runId, {
    onCell: (cell) => {
      batch.push(cell);
      timer ??= setTimeout(flush, CELL_BATCH_MS);
    },
    onExtractionChanged: ({ fileId, revision }) => {
      if (store().runId === runId) store().setExtractionRevision(fileId, revision);
    },
    onAssistantEvent: (event) => {
      if (store().runId === runId) store().applyAssistantEvent(event);
    },
    onStateChange: (state) => {
      if (store().runId === runId) store().setConnection(state);
    },
    onOpen: () => void load(),
  });

  return () => {
    unsubscribe();
    controller.abort();
    if (timer) clearTimeout(timer);
    if (store().runId === runId) store().setConnection("idle");
  };
}
