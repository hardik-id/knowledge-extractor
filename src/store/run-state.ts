import type { Execution, Run, StageCell, WorkStageId } from "@/services/contracts";
import type { StageId, StageRunStatus } from "@/types/pipeline";

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
