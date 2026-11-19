import { isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import type { SourceKind } from "@/types/pipeline";
import { mergeCells, noteKnownExtractions, sameDocuments, selectionFromRun } from "../run-state";
import type { FilesSlice, ProjectSlice, RunSlice, SliceCreator } from "../types";

const NO_PROJECT = {
  projectId: null,
  project: null,
  projectLoad: "idle",
} satisfies Partial<ProjectSlice>;

/** The pipeline's store: it never opens a project. */
export const createNoProjectSlice: SliceCreator<ProjectSlice> = () => ({
  ...NO_PROJECT,
  openProject: async () => {},
});

/** What a project's store does differently from the pipeline's. */
export type ProjectStoreSlice = ProjectSlice &
  Pick<FilesSlice, "setActiveSource"> &
  Pick<RunSlice, "setActiveDoc" | "ensureRun" | "loadRun" | "applySnapshot" | "discardRun">;

/** Small things worth keeping across a reload of the tab, per project. */
interface Conveniences {
  activeDocId: string | null;
  activeSource: SourceKind;
}

const conveniencesKey = (prefix: string, projectId: string) => `${prefix}:${projectId}`;

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

/** Removes every project's conveniences from this tab (sign-out). */
export function clearProjectConveniences(prefix: string): void {
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
    error.code === "project_not_found" ||
    error.code === "run_not_found");

/**
 * A store open on one project (Knowledge Studio). The address decides the
 * project, the project decides the run, and the selection is the run's files:
 * opening the same address in another tab, or after a restart, gives the same
 * state. Only the active document and source tab are kept in sessionStorage,
 * under `prefix:<project id>`.
 *
 * The run belongs to the project, so it is never discarded or replaced:
 * choosing documents only changes the selection here, and `ensureRun` sends
 * it to the run with `setDocuments`.
 *
 * `base` is the store's other slices, whose behaviour this one extends.
 */
export function createProjectSlice(
  prefix: string,
  base: FilesSlice & RunSlice,
): SliceCreator<ProjectStoreSlice> {
  return (set, get, api) => {
    /** Counts openings, so an older one that answers late changes nothing. */
    let opening = 0;
    let saving: Promise<void> | null = null;

    const saveConveniences = () => {
      const { projectId, activeDocId, activeSource } = get();
      if (projectId)
        writeConveniences(conveniencesKey(prefix, projectId), { activeDocId, activeSource });
    };

    return {
      ...NO_PROJECT,

      openProject: async (projectId) => {
        const current = get();
        if (current.projectId === projectId && current.projectLoad !== "error") return;

        const attempt = ++opening;
        // Superseded by a later opening, or the store was reset meanwhile (sign-out).
        const stale = () => attempt !== opening || get().projectId !== projectId;
        set({
          ...api.getInitialState(),
          hasHydrated: current.hasHydrated,
          projectId,
          projectLoad: "loading",
          ...readConveniences(conveniencesKey(prefix, projectId)),
        });

        try {
          const project = await services.projects.get(projectId);
          if (stale()) return;
          const run = await services.runs.getRun(project.runId);
          if (stale()) return;
          set({
            project,
            projectLoad: "ready",
            runId: run.id,
            runFiles: run.files,
            cells: mergeCells({}, run.cells),
            runLoad: "ready",
            extractionRevisions: noteKnownExtractions({}, {}, run.cells),
            selectedFiles: selectionFromRun(run.files),
          });
        } catch (error) {
          if (!stale()) set({ projectLoad: isGone(error) ? "gone" : "error" });
        }
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
        // The run goes with its project.
        if (result === "gone") set({ projectLoad: "gone" });
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

      // A new selection must not let go of the project's run.
      discardRun: () => {},
    };
  };
}
