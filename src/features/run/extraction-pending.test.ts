import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CellStatus, StageCell } from "@/services/contracts";
import type { PipelineState } from "@/store/types";
import { awaitsExtraction } from "./extraction-pending";

function cell(status: CellStatus): StageCell {
  return {
    fileId: "f1",
    stage: "extract",
    status,
    executionId: "e1",
    progress: null,
    error: null,
    output: null,
    updatedAt: "2026-11-19T10:00:00Z",
  };
}

const state = (
  status: CellStatus | null,
  revision?: number,
): Pick<PipelineState, "cells" | "extractionRevisions"> => ({
  cells: status ? { f1: { extract: cell(status) } } : {},
  extractionRevisions: revision === undefined ? {} : { f1: revision },
});

describe("awaitsExtraction", () => {
  test("waits while the first extraction is queued or running", () => {
    assert.equal(awaitsExtraction(state("queued"), "f1"), true);
    assert.equal(awaitsExtraction(state("running"), "f1"), true);
  });

  test("fetches once records are known in this session", () => {
    assert.equal(awaitsExtraction(state("running", 0), "f1"), false);
    assert.equal(awaitsExtraction(state("queued", 3), "f1"), false);
  });

  test("fetches when nothing is on its way", () => {
    for (const status of ["pending", "succeeded", "failed", "stale"] as const) {
      assert.equal(awaitsExtraction(state(status), "f1"), false, status);
    }
    assert.equal(awaitsExtraction(state(null), "f1"), false);
  });
});
