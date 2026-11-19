import type { Execution, Run, RunFile, StageCell, WorkStageId } from "@/services/contracts";
import type { SourceFile, StageId, StageRunStatus } from "@/types/pipeline";

/**
 * Pure rules for run state: how cell updates are merged and how a stage's
 * status follows from its cells. No React and no store, so they can be tested
 * on their own.
 */

/** cells[fileId][stage] */
export type CellMap = Record<string, Partial<Record<WorkStageId, StageCell>>>;

/** A stage's work, before "the person proceeded past it" is taken into account. */
export type StageWorkStatus = "idle" | "running" | "ready" | "error";

/**
 * True when `incoming` should replace `current`. Updates can arrive out of
 * order (a snapshot and the live stream overlap), so the later `updatedAt`
 * wins. On a tie, or a date that can't be read, the one that arrived last wins.
 */
export function isNewerCell(incoming: StageCell, current: StageCell | undefined): boolean {
  if (!current) return true;
  const a = Date.parse(incoming.updatedAt);
  const b = Date.parse(current.updatedAt);
  return Number.isNaN(a) || Number.isNaN(b) || a >= b;
}

/** Applies cell updates. Returns `current` itself when nothing changed. */
export function mergeCells(current: CellMap, incoming: readonly StageCell[]): CellMap {
  let next = current;
  for (const cell of incoming) {
    if (!isNewerCell(cell, next[cell.fileId]?.[cell.stage])) continue;
    if (next === current) next = { ...current };
    next[cell.fileId] = { ...next[cell.fileId], [cell.stage]: cell };
  }
  return next;
}

/**
 * The cells after a snapshot. The snapshot is the base; a cell already held
 * wins if it is at least as new, because a live update can overtake a snapshot
 * that was still on its way. Cells of files the run no longer has are dropped.
 */
export function mergeSnapshot(current: CellMap, run: Run): CellMap {
  const held: StageCell[] = [];
  for (const file of run.files) {
    held.push(...Object.values(current[file.id] ?? {}));
  }
  return mergeCells(mergeCells({}, run.cells), held);
}

/**
 * Notes the files whose extraction records may already exist, from cells about
 * to be merged into `current`: revision 0 for each one with no revision known.
 * That doesn't change what is fetched, only that a file's records are fetched
 * while it is extracted again (see `awaitsExtraction`), because these facts
 * don't survive a reload and `markQueued` clears a cell's output.
 * - an extract cell with output: the file was extracted before;
 * - an extract cell first seen queued or running (the page was reloaded during
 *   a run): it may be a re-run, and its records must not be hidden for the run.
 * Returns `revisions` itself when nothing is added.
 */
export function noteKnownExtractions(
  revisions: Record<string, number>,
  current: CellMap,
  incoming: readonly StageCell[],
): Record<string, number> {
  let next = revisions;
  for (const cell of incoming) {
    if (cell.stage !== "extract" || next[cell.fileId] !== undefined) continue;
    const firstSeenActive =
      !current[cell.fileId]?.extract && (cell.status === "queued" || cell.status === "running");
    if (cell.output === null && !firstSeenActive) continue;
    if (next === revisions) next = { ...revisions };
    next[cell.fileId] = 0;
  }
  return next;
}

/**
 * Shows an accepted execution at once, without waiting for its first live
 * update. `updatedAt` is left alone so anything the server says later wins.
 */
export function markQueued(current: CellMap, execution: Execution): CellMap {
  const next = { ...current };
  for (const fileId of execution.fileIds) {
    const cell = current[fileId]?.[execution.stage];
    if (cell?.executionId === execution.id) continue; // the server was faster
    next[fileId] = {
      ...current[fileId],
      [execution.stage]: {
        fileId,
        stage: execution.stage,
        updatedAt: cell?.updatedAt ?? new Date(0).toISOString(),
        status: "queued",
        executionId: execution.id,
        progress: null,
        error: null,
        output: null,
      } satisfies StageCell,
    };
  }
  return next;
}

/**
 * - running: a file is queued or being worked on
 * - error:   a file failed
 * - ready:   every file succeeded
 * - idle:    anything else, including output that is out of date
 */
export function deriveStageStatus(
  cells: CellMap,
  fileIds: readonly string[],
  stage: WorkStageId,
): StageWorkStatus {
  let succeeded = 0;
  let failed = false;
  for (const fileId of fileIds) {
    const status = cells[fileId]?.[stage]?.status;
    if (status === "queued" || status === "running") return "running";
    if (status === "failed") failed = true;
    else if (status === "succeeded") succeeded++;
  }
  if (failed) return "error";
  return fileIds.length > 0 && succeeded === fileIds.length ? "ready" : "idle";
}

/** The part of the store a stage's status is derived from. */
export interface StageStatusSource {
  runFiles: readonly { id: string }[];
  cells: CellMap;
  startingStages: readonly WorkStageId[];
  proceededStages: readonly StageId[];
}

/**
 * What the sidebar and the footer show for a stage. Nothing stores this: it
 * follows from the cells, plus whether the person has proceeded past the stage.
 * A stage that was done and then went out of date reads as idle again.
 */
export function selectStageStatus(state: StageStatusSource, stage: StageId): StageRunStatus {
  const proceeded = state.proceededStages.includes(stage);
  if (stage === "select") return proceeded ? "done" : "idle";
  if (state.startingStages.includes(stage)) return "running";

  const work = deriveStageStatus(
    state.cells,
    state.runFiles.map((file) => file.id),
    stage,
  );
  return work === "ready" && proceeded ? "done" : work;
}

/** The run's files as the catalog listed them: the selection a run stands for. */
export function selectionFromRun(files: readonly RunFile[]): SourceFile[] {
  return files.map(({ sourceRef, ...file }) => ({ ...file, id: sourceRef }));
}

/** True when the selection is exactly the run's documents, in any order. */
export function sameDocuments(
  selection: readonly SourceFile[],
  files: readonly RunFile[],
): boolean {
  if (selection.length !== files.length) return false;
  const refs = new Set(files.map((file) => file.sourceRef));
  return selection.every((file) => refs.has(file.id));
}
