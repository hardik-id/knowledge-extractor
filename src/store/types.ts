import type { StateCreator } from "zustand";
import type {
  AssistantEvent,
  AssistantMessage,
  ConnectionState,
  ExecuteStageOptions,
  Project,
  Run,
  RunFile,
  StageCell,
  WorkStageId,
} from "@/services/contracts";
import type { SourceFile, SourceKind, StageId } from "@/types/pipeline";
import type { CellMap } from "./run-state";

export interface NavigationSlice {
  /**
   * Stages the person has proceeded past. How far a stage's work is comes from
   * the run's cells (see `selectStageStatus`), not from here.
   */
  proceededStages: StageId[];
  /** True once persisted state has been read from sessionStorage (client only). */
  hasHydrated: boolean;
  /** Mark a stage done (the person proceeded past it). */
  completeStage: (id: StageId) => void;
  /** Forget that `id` and every later stage were proceeded past. */
  invalidateFrom: (id: StageId) => void;
}

export interface FilesSlice {
  activeSource: SourceKind;
  searchQuery: string;
  /** Whole files, not ids: the catalog is remote, so they can't be looked up again later. */
  selectedFiles: SourceFile[];
  setActiveSource: (source: SourceKind) => void;
  setSearchQuery: (query: string) => void;
  toggleFile: (file: SourceFile) => void;
  setSelection: (files: SourceFile[]) => void;
  clearSelection: () => void;
}

/** Whether the run's snapshot has been fetched since the page opened. */
export type RunLoadState = "idle" | "loading" | "ready" | "error";

export type RunLoadResult = "loaded" | "gone" | "failed" | "cancelled";

export interface RunSlice {
  /** The run on the server. Null until the person proceeds from file selection. */
  runId: string | null;
  /** The run's files. Their ids are the server's, not the catalog's. */
  runFiles: RunFile[];
  cells: CellMap;
  runLoad: RunLoadState;
  /** Why the last load failed, while `runLoad` is "error". */
  runError: unknown;
  creatingRun: boolean;
  /** Stages whose "run" request is on its way to the server. */
  startingStages: WorkStageId[];
  connection: ConnectionState;
  activeDocId: string | null;
  /** The latest revision of each file's extraction records, by file id. Fetch again when it changes. */
  extractionRevisions: Record<string, number>;
  assistantMessages: AssistantMessage[];

  setActiveDoc: (fileId: string | null) => void;
  setConnection: (state: ConnectionState) => void;
  /** The conversation with the extraction assistant, oldest first. */
  setAssistantMessages: (messages: AssistantMessage[]) => void;
  /** Adds a message, or replaces the one with the same id. */
  putAssistantMessage: (message: AssistantMessage) => void;
  /** Live parts of a reply. A part for a message not seen yet starts that message. */
  applyAssistantEvent: (event: AssistantEvent) => void;
  /** Live updates. A lower revision than the one known is ignored. */
  setExtractionRevision: (fileId: string, revision: number) => void;
  /**
   * Creates a run from the selected files unless there is one. In a project's
   * store the run always exists: it makes the selection the run's documents
   * instead, and the run id stays. Rejects with an ApiError.
   */
  ensureRun: () => Promise<void>;
  /** Fetches the snapshot of the current run. Never rejects. */
  loadRun: (signal?: AbortSignal) => Promise<RunLoadResult>;
  applySnapshot: (run: Run) => void;
  /** Live updates. For each cell, the newer `updatedAt` wins. */
  applyCells: (cells: StageCell[]) => void;
  /**
   * Asks the server to run a stage and returns once it has accepted. It does
   * not wait for the work: that arrives as cells. Rejects with an ApiError.
   */
  executeStage: (stage: WorkStageId, options?: ExecuteStageOptions) => Promise<void>;
  /** Forget the run here and delete it on the server (best effort). */
  discardRun: () => void;
  /** Start over: no run and no selection. */
  resetRun: () => void;
}

/** Whether the project (and its run) has been fetched since it was opened here. */
export type ProjectLoadState = "idle" | "loading" | "ready" | "gone" | "error";

/**
 * The project the store is open on. Knowledge Studio only: the pipeline's
 * store never has one. The address names the project, the project names its
 * run, and the selection is the run's files, so nothing here is kept in
 * the browser except small conveniences (see `createProjectSlice`).
 */
export interface ProjectSlice {
  projectId: string | null;
  project: Project | null;
  projectLoad: ProjectLoadState;
  /** Why the project failed to load, while `projectLoad` is "error". */
  projectError: unknown;
  /**
   * Starts over on this project: fetches it, then its run. Does nothing when
   * it is already open (or opening). Never rejects: the outcome is `projectLoad`.
   */
  openProject: (projectId: string) => Promise<void>;
  /** Shows a changed project (a rename) at once. Ignored unless it is the open one. */
  setProject: (project: Project) => void;
}

export type PipelineState = NavigationSlice & FilesSlice & RunSlice & ProjectSlice;

export type SliceCreator<T> = StateCreator<PipelineState, [["zustand/persist", unknown]], [], T>;
