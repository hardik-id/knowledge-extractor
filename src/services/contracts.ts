import { STAGE_IDS, type SourceFile, type SourceKind, type StageId } from "@/types/pipeline";

/**
 * The contract between the UI and the backend. The store and components
 * depend only on these types; `services/http` and `services/mock` implement them.
 *
 * Model: a run is a set of files. For every file and every stage there is one
 * cell that says how far that work is. Commands go out over REST, the full
 * state comes back as a snapshot, and changes arrive as single cells.
 */

/** Stages that do work on files (everything after file selection). */
export type WorkStageId = Exclude<StageId, "select">;

export const WORK_STAGE_IDS = STAGE_IDS.filter(
  (id): id is WorkStageId => id !== "select",
) as readonly WorkStageId[];

export function isWorkStageId(value: unknown): value is WorkStageId {
  return typeof value === "string" && (WORK_STAGE_IDS as readonly string[]).includes(value);
}

/**
 * - pending:   never run
 * - queued:    accepted, waiting for a worker
 * - running:   a worker is on it
 * - succeeded: finished, output available
 * - failed:    finished with an error
 * - stale:     finished, but an earlier stage was run again since
 */
export const CELL_STATUSES = [
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "stale",
] as const;

export type CellStatus = (typeof CELL_STATUSES)[number];

export interface StageOutputMeta {
  /** File name of the output, e.g. "leave-policy-2026.md" */
  name: string;
  contentType: string;
  sizeBytes: number;
  /** Changes whenever the output changes: use it as a cache key. */
  etag: string;
}

export interface CellError {
  code: string;
  message: string;
}

/** The state of one stage for one file. */
export interface StageCell {
  fileId: string;
  stage: WorkStageId;
  status: CellStatus;
  /** The execution (one click on run) that produced this state. */
  executionId: string | null;
  /** 0–100, or null when the backend doesn't report progress. */
  progress: number | null;
  error: CellError | null;
  output: StageOutputMeta | null;
  updatedAt: string; // ISO-8601
}

/** A file inside a run. `id` is the backend's id for it, used in every later call. */
export interface RunFile extends SourceFile {
  /** The id the file had in the source catalog when it was selected. */
  sourceRef: string;
}

export interface Run {
  id: string;
  createdAt: string; // ISO-8601
  files: RunFile[];
  cells: StageCell[];
}

export interface ExecuteStageOptions {
  /** Limit the execution to these files. Default: every file in the run. */
  fileIds?: string[];
  /** Stage settings for this execution. */
  config?: Record<string, unknown>;
}

export interface Execution {
  id: string;
  stage: WorkStageId;
  fileIds: string[];
}

export interface StageOutputContent {
  text: string;
  contentType: string;
}

export interface SourceCatalog {
  list(source: SourceKind, query: string, signal?: AbortSignal): Promise<SourceFile[]>;
}

/**
 * Every method rejects with an ApiError (see lib/api). Codes the UI handles:
 * `run_not_found` (404), `execution_in_progress` (409), `upstream_not_ready` (422).
 */
export interface RunsApi {
  createRun(files: SourceFile[]): Promise<Run>;
  getRun(runId: string, signal?: AbortSignal): Promise<Run>;
  /** Starts the work and returns at once. Progress arrives as cells. */
  executeStage(
    runId: string,
    stage: WorkStageId,
    options?: ExecuteStageOptions,
  ): Promise<Execution>;
  /** The text of one output (Markdown, JSON). */
  getOutput(
    runId: string,
    fileId: string,
    stage: WorkStageId,
    signal?: AbortSignal,
  ): Promise<StageOutputContent>;
  deleteRun(runId: string): Promise<void>;
}

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface RunEventHandlers {
  onCell(cell: StageCell): void;
  onStateChange?(state: ConnectionState): void;
  /** The connection is (back) up. Cells may have been missed: fetch the snapshot. */
  onOpen?(): void;
}

export interface RunEvents {
  /** Returns the function that ends the subscription. */
  subscribe(runId: string, handlers: RunEventHandlers): () => void;
}

export interface Services {
  catalog: SourceCatalog;
  runs: RunsApi;
  events: RunEvents;
}
