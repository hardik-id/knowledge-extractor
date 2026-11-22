import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StageCell } from "@/services/contracts";
import { planRun, type RunPlanInput } from "./run-plan";

function cell(fileId: string, over: Partial<StageCell> = {}): StageCell {
  return {
    fileId,
    stage: "extract",
    status: "succeeded",
    executionId: "e1",
    progress: null,
    error: null,
    output: { name: "a.json", contentType: "application/json", sizeBytes: 1, etag: "x" },
    updatedAt: "2026-11-22T10:00:00Z",
    ...over,
  };
}

function input(over: Partial<RunPlanInput> = {}): RunPlanInput {
  return {
    fileIds: ["a", "b"],
    activeId: "a",
    cells: {},
    versions: {},
    savedVersion: 3,
    dirty: false,
    empty: false,
    running: false,
    ...over,
  };
}

const current = { a: cell("a"), b: cell("b") };
const atVersion = { a: 3, b: 3 };

describe("planRun", () => {
  test("a document with no results runs alone, with all in the menu", () => {
    const plan = planRun(input());
    assert.equal(plan.main.label, "Run on this document");
    assert.deepEqual(plan.main.fileIds, ["a"]);
    assert.equal(plan.primary, true);
    assert.equal(plan.disabled, false);
    assert.equal(plan.alternative?.label, "Run on all 2 documents");
    assert.equal(plan.alternative?.fileIds, undefined);
  });

  test("one document: no menu item", () => {
    const plan = planRun(input({ fileIds: ["a"] }));
    assert.equal(plan.main.label, "Run on this document");
    assert.equal(plan.alternative, undefined);
  });

  test("a document run by an older version is out of date", () => {
    const plan = planRun(input({ cells: current, versions: { a: 2, b: 3 } }));
    assert.equal(plan.main.label, "Run on this document");
    assert.deepEqual(plan.main.fileIds, ["a"]);
  });

  test("a failed or stale cell is out of date", () => {
    for (const status of ["failed", "stale"] as const) {
      const plan = planRun(
        input({ cells: { ...current, a: cell("a", { status }) }, versions: atVersion }),
      );
      assert.equal(plan.main.label, "Run on this document");
    }
  });

  test("this one is current and another is not: run on all", () => {
    const plan = planRun(input({ cells: { a: cell("a") }, versions: atVersion }));
    assert.equal(plan.main.label, "Run on all 2 documents");
    assert.equal(plan.main.fileIds, undefined);
    assert.equal(plan.primary, true);
    assert.equal(plan.alternative, undefined);
  });

  test("everything current: a secondary Run again", () => {
    const plan = planRun(input({ cells: current, versions: atVersion }));
    assert.equal(plan.main.label, "Run again");
    assert.equal(plan.primary, false);
    assert.equal(plan.disabled, false);
  });

  test("a version not known yet counts as current", () => {
    const plan = planRun(input({ cells: current, versions: {} }));
    assert.equal(plan.main.label, "Run again");
  });

  test("unsaved changes make every document out of date", () => {
    const plan = planRun(input({ cells: current, versions: atVersion, dirty: true }));
    assert.equal(plan.main.label, "Run on this document");
    assert.equal(plan.alternative?.label, "Run on all 2 documents");
  });

  test("disabled while the configuration is empty", () => {
    const plan = planRun(input({ empty: true }));
    assert.equal(plan.disabled, true);
    assert.equal(plan.primary, false);
    assert.equal(plan.alternative, undefined);
  });

  test("disabled while a run is going", () => {
    const plan = planRun(input({ cells: current, versions: atVersion, running: true }));
    assert.equal(plan.disabled, true);
    assert.equal(plan.primary, true);
  });

  test("an unknown open document falls back to the first", () => {
    const plan = planRun(input({ activeId: "zzz" }));
    assert.deepEqual(plan.main.fileIds, ["a"]);
  });

  test("no documents: disabled, and the label does not count zero", () => {
    const plan = planRun(input({ fileIds: [], activeId: null }));
    assert.equal(plan.disabled, true);
    assert.equal(plan.main.label, "Run");
  });

  test("versions not known while loading: results are taken as current", () => {
    const plan = planRun(input({ cells: current }));
    assert.equal(plan.main.label, "Run again");
  });

  test("versions that failed to load: results are out of date", () => {
    const plan = planRun(input({ cells: current, versionsFailed: true }));
    assert.equal(plan.main.label, "Run on this document");
    assert.equal(plan.primary, true);
  });
});
