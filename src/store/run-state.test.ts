import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CellStatus, Run, StageCell, WorkStageId } from "@/services/contracts";
import {
  deriveStageStatus,
  markQueued,
  mergeCells,
  mergeSnapshot,
  noteKnownExtractions,
  selectStageStatus,
  type CellMap,
  type StageStatusSource,
} from "./run-state";

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

function cell(
  fileId: string,
  stage: WorkStageId,
  status: CellStatus,
  seconds: number,
  executionId: string | null = null,
): StageCell {
  return {
    fileId,
    stage,
    status,
    executionId,
    progress: null,
    error: null,
    output: null,
    updatedAt: at(seconds),
  };
}

const statusOf = (cells: CellMap, fileId: string, stage: WorkStageId) =>
  cells[fileId]?.[stage]?.status;

describe("mergeCells", () => {
  test("a newer update replaces the cell", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "queued", 1)]);
    const next = mergeCells(cells, [cell("a", "ingest", "running", 2)]);
    assert.equal(statusOf(next, "a", "ingest"), "running");
  });

  test("an update that arrives late does not undo a newer one", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "succeeded", 5)]);
    const next = mergeCells(cells, [cell("a", "ingest", "running", 3)]);
    assert.equal(statusOf(next, "a", "ingest"), "succeeded");
    assert.equal(next, cells, "nothing changed, so the same object comes back");
  });

  test("on equal timestamps the one that arrived last wins", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "queued", 1)]);
    const next = mergeCells(cells, [cell("a", "ingest", "running", 1)]);
    assert.equal(statusOf(next, "a", "ingest"), "running");
  });

  test("a batch is applied in order and leaves other cells alone", () => {
    const cells = mergeCells({}, [cell("b", "ingest", "succeeded", 1)]);
    const next = mergeCells(cells, [
      cell("a", "ingest", "running", 2),
      cell("a", "ingest", "succeeded", 3),
      cell("a", "transform", "queued", 4),
    ]);
    assert.equal(statusOf(next, "a", "ingest"), "succeeded");
    assert.equal(statusOf(next, "a", "transform"), "queued");
    assert.equal(next.b, cells.b);
    assert.deepEqual(cells.a, undefined, "the input is not changed");
  });
});

describe("mergeSnapshot", () => {
  const run = (cells: StageCell[], fileIds = ["a"]): Run => ({
    id: "run-1",
    createdAt: at(0),
    files: fileIds.map((id) => ({
      id,
      sourceRef: id,
      name: `${id}.pdf`,
      source: "confluence",
      type: "pdf",
      sizeBytes: 1,
      location: "Space",
      modifiedAt: at(0),
    })),
    cells,
  });

  test("a live update that overtook the snapshot is kept", () => {
    const live = mergeCells({}, [cell("a", "ingest", "succeeded", 9)]);
    const next = mergeSnapshot(live, run([cell("a", "ingest", "running", 4)]));
    assert.equal(statusOf(next, "a", "ingest"), "succeeded");
  });

  test("the snapshot fills in what was missed while disconnected", () => {
    const live = mergeCells({}, [cell("a", "ingest", "running", 2)]);
    const next = mergeSnapshot(
      live,
      run([cell("a", "ingest", "succeeded", 7), cell("a", "transform", "queued", 8)]),
    );
    assert.equal(statusOf(next, "a", "ingest"), "succeeded");
    assert.equal(statusOf(next, "a", "transform"), "queued");
  });

  test("cells of files the run no longer has are dropped", () => {
    const live = mergeCells({}, [cell("gone", "ingest", "succeeded", 9)]);
    const next = mergeSnapshot(live, run([cell("a", "ingest", "pending", 1)]));
    assert.deepEqual(Object.keys(next), ["a"]);
  });
});

describe("markQueued", () => {
  const execution = { id: "exec-2", stage: "ingest" as const, fileIds: ["a"] };

  test("shows the accepted execution, and lets the server's next word win", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "succeeded", 5, "exec-1")]);
    const queued = markQueued(cells, execution);
    assert.equal(statusOf(queued, "a", "ingest"), "queued");
    assert.equal(queued.a?.ingest?.executionId, "exec-2");

    const next = mergeCells(queued, [cell("a", "ingest", "running", 6, "exec-2")]);
    assert.equal(statusOf(next, "a", "ingest"), "running");
  });

  test("does not step back when the server was faster", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "running", 6, "exec-2")]);
    assert.equal(statusOf(markQueued(cells, execution), "a", "ingest"), "running");
  });
});

describe("noteKnownExtractions", () => {
  const withOutput = (c: StageCell): StageCell => ({
    ...c,
    output: { name: "a.json", contentType: "application/json", sizeBytes: 1, etag: "x" },
  });

  test("an extract cell with output means the file may have records", () => {
    const revisions = noteKnownExtractions({}, {}, [
      withOutput(cell("a", "extract", "succeeded", 1)),
    ]);
    assert.deepEqual(revisions, { a: 0 });
  });

  test("an extract cell first seen queued or running may be a re-run", () => {
    const incoming = [cell("a", "extract", "queued", 1), cell("b", "extract", "running", 1)];
    assert.deepEqual(noteKnownExtractions({}, {}, incoming), { a: 0, b: 0 });
  });

  test("a cell seen before it was queued, or never run, notes nothing", () => {
    const current = mergeCells({}, [cell("a", "extract", "pending", 1)]);
    const revisions = {};
    assert.equal(
      noteKnownExtractions(revisions, current, [
        cell("a", "extract", "queued", 2),
        cell("b", "extract", "pending", 1),
        cell("c", "extract", "failed", 1),
        withOutput(cell("d", "enrich", "succeeded", 1)),
      ]),
      revisions,
    );
  });

  test("a known revision is kept", () => {
    const revisions = { a: 4 };
    assert.equal(
      noteKnownExtractions(revisions, {}, [withOutput(cell("a", "extract", "succeeded", 1))]),
      revisions,
    );
  });
});

describe("deriveStageStatus", () => {
  const cellsFor = (...statuses: CellStatus[]) =>
    mergeCells(
      {},
      statuses.map((status, i) => cell(`f${i}`, "ingest", status, 1)),
    );
  const ids = (count: number) => Array.from({ length: count }, (_, i) => `f${i}`);
  const derive = (...statuses: CellStatus[]) =>
    deriveStageStatus(cellsFor(...statuses), ids(statuses.length), "ingest");

  test("running while any file is queued or running, even if another failed", () => {
    assert.equal(derive("succeeded", "queued"), "running");
    assert.equal(derive("failed", "running"), "running");
  });

  test("error when a file failed and nothing is running", () => {
    assert.equal(derive("succeeded", "failed"), "error");
  });

  test("ready only when every file succeeded", () => {
    assert.equal(derive("succeeded", "succeeded"), "ready");
    assert.equal(derive("succeeded", "pending"), "idle");
  });

  test("out-of-date output does not count as finished", () => {
    assert.equal(derive("succeeded", "stale"), "idle");
  });

  test("idle without files or without cells", () => {
    assert.equal(deriveStageStatus({}, [], "ingest"), "idle");
    assert.equal(deriveStageStatus({}, ["f0"], "ingest"), "idle");
  });
});

describe("selectStageStatus", () => {
  const state = (overrides: Partial<StageStatusSource>): StageStatusSource => ({
    runFiles: [{ id: "a" }],
    cells: {},
    startingStages: [],
    proceededStages: [],
    ...overrides,
  });

  test("file selection is done once the person proceeded", () => {
    assert.equal(selectStageStatus(state({}), "select"), "idle");
    assert.equal(selectStageStatus(state({ proceededStages: ["select"] }), "select"), "done");
  });

  test("a finished stage is ready, and done after proceeding", () => {
    const cells = mergeCells({}, [cell("a", "ingest", "succeeded", 1)]);
    assert.equal(selectStageStatus(state({ cells }), "ingest"), "ready");
    assert.equal(
      selectStageStatus(state({ cells, proceededStages: ["select", "ingest"] }), "ingest"),
      "done",
    );
  });

  test("a done stage that went out of date needs running again", () => {
    const cells = mergeCells({}, [cell("a", "transform", "stale", 1)]);
    assert.equal(
      selectStageStatus(state({ cells, proceededStages: ["transform"] }), "transform"),
      "idle",
    );
  });

  test("running from the click, before the server has answered", () => {
    assert.equal(selectStageStatus(state({ startingStages: ["ingest"] }), "ingest"), "running");
  });
});
