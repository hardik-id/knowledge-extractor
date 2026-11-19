import { isAbortError, isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import { markQueued, mergeCells, mergeSnapshot, noteKnownExtractions } from "../run-state";
import type { RunSlice, SliceCreator } from "../types";

const NO_RUN = {
  runId: null,
  runFiles: [],
  cells: {},
  runLoad: "idle",
  startingStages: [],
  connection: "idle",
  activeDocId: null,
  extractionRevisions: {},
  assistantMessages: [],
} satisfies Partial<RunSlice>;

/**
 * The run on the server, mirrored here. Commands go out through `services`;
 * state comes back as a snapshot (`loadRun`) and as live cells (`applyCells`).
 * <RunSync> decides when to load and keeps the live connection.
 */
export const createRunSlice: SliceCreator<RunSlice> = (set, get) => {
  /** Shared by callers that ask at the same time, so only one run is created. */
  let creating: Promise<void> | null = null;

  return {
    ...NO_RUN,
    creatingRun: false,

    setActiveDoc: (activeDocId) => set({ activeDocId }),
    setConnection: (connection) => set({ connection }),
    setAssistantMessages: (assistantMessages) => set({ assistantMessages }),
    putAssistantMessage: (message) =>
      set((s) => ({
        assistantMessages: s.assistantMessages.some((m) => m.id === message.id)
          ? s.assistantMessages.map((m) => (m.id === message.id ? message : m))
          : [...s.assistantMessages, message],
      })),
    applyAssistantEvent: (event) =>
      set((s) => {
        const known = s.assistantMessages.find((m) => m.id === event.messageId);
        const message = known ?? {
          id: event.messageId,
          role: "assistant" as const,
          text: "",
          proposal: null,
          status: "streaming" as const,
          createdAt: new Date().toISOString(),
        };
        const next =
          event.type === "delta"
            ? { ...message, text: message.text + event.text }
            : event.type === "proposal"
              ? { ...message, proposal: event.proposal }
              : { ...message, status: "done" as const };
        return {
          assistantMessages: known
            ? s.assistantMessages.map((m) => (m.id === next.id ? next : m))
            : [...s.assistantMessages, next],
        };
      }),
    setExtractionRevision: (fileId, revision) =>
      set((s) =>
        (s.extractionRevisions[fileId] ?? -1) >= revision
          ? s
          : { extractionRevisions: { ...s.extractionRevisions, [fileId]: revision } },
      ),

    ensureRun: () => {
      if (get().runId) return Promise.resolve();
      creating ??= (async () => {
        set({ creatingRun: true });
        try {
          const run = await services.runs.createRun(get().selectedFiles);
          set({
            ...NO_RUN,
            runId: run.id,
            runFiles: run.files,
            cells: mergeCells({}, run.cells),
            runLoad: "ready",
          });
        } finally {
          creating = null;
          set({ creatingRun: false });
        }
      })();
      return creating;
    },

    loadRun: async (signal) => {
      const runId = get().runId;
      if (!runId) return "cancelled";
      // A refresh of a run that is already on screen stays quiet.
      if (get().runLoad !== "ready") set({ runLoad: "loading" });

      try {
        const run = await services.runs.getRun(runId, signal);
        if (get().runId !== runId) return "cancelled";
        get().applySnapshot(run);
        return "loaded";
      } catch (error) {
        if (isAbortError(error) || signal?.aborted || get().runId !== runId) return "cancelled";
        if (isApiError(error) && (error.status === 404 || error.code === "run_not_found")) {
          // The server no longer has it. The selection is kept so a new run is one click away.
          set(NO_RUN);
          get().invalidateFrom("select");
          return "gone";
        }
        if (get().runLoad !== "ready") set({ runLoad: "error" });
        return "failed";
      }
    },

    applySnapshot: (run) =>
      set((s) =>
        s.runId === run.id
          ? {
              runFiles: run.files,
              cells: mergeSnapshot(s.cells, run),
              runLoad: "ready",
              extractionRevisions: noteKnownExtractions(s.extractionRevisions, s.cells, run.cells),
            }
          : s,
      ),

    applyCells: (cells) =>
      set((s) => {
        const next = mergeCells(s.cells, cells);
        const revisions = noteKnownExtractions(s.extractionRevisions, s.cells, cells);
        if (next === s.cells && revisions === s.extractionRevisions) return s;
        return { cells: next, extractionRevisions: revisions };
      }),

    executeStage: async (stage, options) => {
      const runId = get().runId;
      if (!runId || get().startingStages.includes(stage)) return;

      set((s) => ({ startingStages: [...s.startingStages, stage] }));
      try {
        const execution = await services.runs.executeStage(runId, stage, options);
        set((s) => (s.runId === runId ? { cells: markQueued(s.cells, execution) } : s));
      } catch (error) {
        if (!(isApiError(error) && error.code === "execution_in_progress")) throw error;
        // Already running (another tab, or a second click): show that execution instead.
        void get().loadRun();
      } finally {
        set((s) => ({ startingStages: s.startingStages.filter((id) => id !== stage) }));
      }
    },

    discardRun: () => {
      const runId = get().runId;
      set(NO_RUN);
      // Best effort: a run that isn't deleted here is left for the server to clean up.
      if (runId) void services.runs.deleteRun(runId).catch(() => {});
    },

    resetRun: () => {
      get().discardRun();
      set({ selectedFiles: [], searchQuery: "", proceededStages: [] });
    },
  };
};
