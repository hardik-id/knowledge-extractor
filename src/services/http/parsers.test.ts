import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { parseCellMessage, parseExecution, parseRun, parseSourceFiles } from "./parsers";

const wireFile = {
  id: "file_1",
  source_ref: "cf-001",
  name: "Leave policy 2026.pdf",
  source: "confluence",
  type: "pdf",
  size_bytes: 482_113,
  location: "HR / Policies",
  modified_at: "2026-10-02T09:12:00Z",
};

const wireCell = {
  file_id: "file_1",
  stage: "transform",
  status: "succeeded",
  execution_id: "exec_1",
  progress: null,
  error: null,
  output: { name: "leave-policy-2026.md", content_type: "text/markdown", size: 2048, etag: "v2" },
  updated_at: "2026-11-14T10:00:00Z",
};

const isInvalidResponse = (error: unknown) => {
  assert.ok(isApiError(error), "throws an ApiError");
  assert.equal(error.code, "invalid_response");
  return true;
};

describe("parsers", () => {
  test("a run comes out in the UI's shape (camelCase)", () => {
    const run = parseRun({
      id: "run_1",
      created_at: "2026-11-14T09:00:00Z",
      files: [wireFile],
      cells: [wireCell],
    });

    assert.deepEqual(run, {
      id: "run_1",
      createdAt: "2026-11-14T09:00:00Z",
      files: [
        {
          id: "file_1",
          sourceRef: "cf-001",
          name: "Leave policy 2026.pdf",
          source: "confluence",
          type: "pdf",
          sizeBytes: 482_113,
          location: "HR / Policies",
          modifiedAt: "2026-10-02T09:12:00Z",
        },
      ],
      cells: [
        {
          fileId: "file_1",
          stage: "transform",
          status: "succeeded",
          executionId: "exec_1",
          progress: null,
          error: null,
          output: {
            name: "leave-policy-2026.md",
            contentType: "text/markdown",
            sizeBytes: 2048,
            etag: "v2",
          },
          updatedAt: "2026-11-14T10:00:00Z",
        },
      ],
    });
  });

  test("a cell for a stage this UI doesn't know is skipped, not an error", () => {
    const run = parseRun({
      id: "run_1",
      created_at: "2026-11-14T09:00:00Z",
      files: [wireFile],
      cells: [wireCell, { ...wireCell, stage: "translate" }],
    });
    assert.equal(run.cells.length, 1);
  });

  test("progress is kept within 0–100", () => {
    const message = (progress: number) =>
      parseCellMessage({ type: "cell", cell: { ...wireCell, status: "running", progress } });
    assert.equal(message(140)?.progress, 100);
    assert.equal(message(-5)?.progress, 0);
    assert.equal(message(42)?.progress, 42);
  });

  test("socket messages that aren't cells give null", () => {
    assert.equal(parseCellMessage({ type: "pong" }), null);
  });

  test("data of the wrong shape is refused with one clear error", () => {
    assert.throws(() => parseRun({ id: "run_1" }), isInvalidResponse);
    assert.throws(
      () => parseCellMessage({ type: "cell", cell: { ...wireCell, status: "finished" } }),
      isInvalidResponse,
    );
    assert.throws(() => parseSourceFiles([wireFile]), isInvalidResponse);
    assert.throws(
      () => parseExecution({ execution_id: "exec_1", stage: "select", file_ids: [] }),
      isInvalidResponse,
    );
  });

  test("an execution and a catalog page are read", () => {
    assert.deepEqual(
      parseExecution({ execution_id: "exec_1", stage: "ingest", file_ids: ["file_1"] }),
      { id: "exec_1", stage: "ingest", fileIds: ["file_1"] },
    );
    assert.equal(parseSourceFiles({ items: [wireFile] })[0].sizeBytes, 482_113);
  });
});
