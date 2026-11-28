import { isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import type { SourceKind } from "@/types/pipeline";
import { mergeCells, noteKnownExtractions, sameDocuments, selectionFromRun } from "../run-state";
import type { FilesSlice, WorkspaceSlice, RunSlice, SliceCreator } from "../types";

const NO_WORKSPACE = {
  workspaceId: null,
  workspace: null,
  workspaceLoad: "idle",
  workspaceError: null,
} satisfies Partial<WorkspaceSlice>;

/** The pipeline's store: it never opens a workspace. */
export const createNoWorkspaceSlice: SliceCreator<WorkspaceSlice> = () => ({
  ...NO_WORKSPACE,
  openWorkspace: async () => {},
  setWorkspace: () => {},
});

/** What a workspace's store does differently from the pipeline's. */
export type WorkspaceStoreSlice = WorkspaceSlice &
  Pick<FilesSlice, "setActiveSource"> &
  Pick<RunSlice, "setActiveDoc" | "ensureRun" | "loadRun" | "applySnapshot" | "discardRun">;

/** Small things worth keeping across a reload of the tab, per workspace. */
interface Conveniences {
  activeDocId: string | null;
  activeSource: SourceKind;
}

const conveniencesKey = (prefix: string, workspaceId: string) => `${prefix}:${workspaceId}`;

function readConveniences(key: string): Partial<Conveniences> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!saved || typeof saved !== "object") return {};
    const { activeDocId, activeSource } = saved as Record<string, unknown>;
    return {
      ...(typeof activeDocId === "string" ? { activeDocId } : {}),
      ...(typeof activeSource === "string" ? { activeSource: activeSource as SourceKind } : {}),
    };
  } catch {
    return {}; // no storage (server, blocked) or something unreadable: start without
  }
}

function writeConveniences(key: string, value: Conveniences): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage only costs the convenience.
  }
}

/** Removes every workspace's conveniences from this tab (sign-out). */
export function clearWorkspaceConveniences(prefix: string): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(`${prefix}:`)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear without storage.
  }
}

const isGone = (error: unknown) =>
  isApiError(error) &&
  (error.status === 404 ||
    error.status === 403 ||
    error.code === "workspace_not_found" ||
    error.code === "run_not_found");

/**
 * A store open on one workspace (Knowledge Studio). The address decides the
 * workspace, the workspace decides the run, and the selection is the run's files:
 * opening the same address in another tab, or after a restart, gives the same
 * state. Only the active document and source tab are kept in sessionStorage,
 * under `prefix:<workspace id>`.
 *
 * The run belongs to the workspace, so it is never discarded or replaced:
 * choosing documents only changes the selection here, and `ensureRun` sends
 * it to the run with `setDocuments`.
 *
 * `base` is the store's other slices, whose behaviour this one extends.
 */
export function createWorkspaceSlice(
  prefix: string,
  base: FilesSlice & RunSlice,
): SliceCreator<WorkspaceStoreSlice> {
  return (set, get, api) => {
    /** Counts openings, so an older one that answers late changes nothing. */
    let opening = 0;
    let saving: Promise<void> | null = null;

    const saveConveniences = () => {
      const { workspaceId, activeDocId, activeSource } = get();
      if (workspaceId)
        writeConveniences(conveniencesKey(prefix, workspaceId), { activeDocId, activeSource });
    };

    return {
      ...NO_WORKSPACE,

      openWorkspace: async (workspaceId) => {
        const current = get();
        if (current.workspaceId === workspaceId && current.workspaceLoad !== "error") return;

        const attempt = ++opening;
        // Superseded by a later opening, or the store was reset meanwhile (sign-out).
        const stale = () => attempt !== opening || get().workspaceId !== workspaceId;
        set({
          ...api.getInitialState(),
          hasHydrated: current.hasHydrated,
          workspaceId,
          workspaceLoad: "loading",
          ...readConveniences(conveniencesKey(prefix, workspaceId)),
        });

        try {
          const workspace = await services.workspaces.get(workspaceId);
          if (stale()) return;
          const run = await services.runs.getRun(workspace.runId);
          if (stale()) return;
          set({
            workspace,
            workspaceLoad: "ready",
            runId: run.id,
            runFiles: run.files,
            cells: mergeCells({}, run.cells),
            runLoad: "ready",
            extractionRevisions: noteKnownExtractions({}, {}, run.cells),
            selectedFiles: selectionFromRun(run.files),
          });
        } catch (error) {
          if (!stale()) {
            set(
              isGone(error)
                ? { workspaceLoad: "gone" }
                : { workspaceLoad: "error", workspaceError: error },
            );
          }
        }
      },

      setWorkspace: (workspace) => {
        if (get().workspaceId === workspace.id && get().workspaceLoad === "ready")
          set({ workspace });
      },

      setActiveDoc: (fileId) => {
        base.setActiveDoc(fileId);
        saveConveniences();
      },

      setActiveSource: (source) => {
        base.setActiveSource(source);
        saveConveniences();
      },

      ensureRun: () => {
        if (saving) return saving;
        const { runId, selectedFiles, runFiles } = get();
        if (!runId || sameDocuments(selectedFiles, runFiles)) return Promise.resolve();
        saving = (async () => {
          set({ creatingRun: true });
          try {
            const run = await services.runs.setDocuments(runId, selectedFiles);
            get().applySnapshot(run);
            set({ selectedFiles: selectionFromRun(run.files) });
          } finally {
            saving = null;
            set({ creatingRun: false });
          }
        })();
        return saving;
      },

      loadRun: async (signal) => {
        const result = await base.loadRun(signal);
        // The run goes with its workspace.
        if (result === "gone") set({ workspaceLoad: "gone" });
        return result;
      },

      // The selection follows the run's documents when they change elsewhere,
      // unless the person is in the middle of choosing different ones.
      applySnapshot: (run) => {
        const { runId, runFiles, selectedFiles } = get();
        base.applySnapshot(run);
        if (
          runId === run.id &&
          sameDocuments(selectedFiles, runFiles) &&
          !sameDocuments(selectedFiles, run.files)
        ) {
          set({ selectedFiles: selectionFromRun(run.files) });
        }
      },

      // A new selection must not let go of the workspace's run.
      discardRun: () => {},
    };
  };
}
