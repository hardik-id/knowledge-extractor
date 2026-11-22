import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionRecord, FileExtraction, StageCell } from "@/services/contracts";
import { documentState } from "./document-states";

function cell(status: StageCell["status"], withOutput = true): StageCell {
  return {
    fileId: "f1",
    stage: "extract",
    status,
    executionId: null,
    progress: null,
    error: null,
    output: withOutput
      ? { name: "f1.json", contentType: "application/json", sizeBytes: 1, etag: "e" }
      : null,
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function record(review: ExtractionRecord["review"]): ExtractionRecord {
  return {
    id: Math.random().toString(),
    fileId: "f1",
    recordTypeId: "t",
    span: null,
    fields: [],
    origin: "llm",
    review,
    useAsExample: false,
  };
}

function extraction(...reviews: ExtractionRecord["review"][]): FileExtraction {
  return {
    fileId: "f1",
    revision: 1,
    sourceEtag: "s",
    definitionVersion: 1,
    records: reviews.map(record),
  };
}

describe("documentState", () => {
  test("says not run yet without a cell or output", () => {
    assert.equal(documentState(undefined, undefined)?.label, "Not run yet");
    assert.equal(documentState(cell("pending", false), undefined)?.label, "Not run yet");
  });

  test("says running for a queued or running cell", () => {
    assert.equal(documentState(cell("queued", false), undefined)?.label, "Running…");
    assert.equal(documentState(cell("running"), extraction("suggested"))?.label, "Running…");
  });

  test("says run failed", () => {
    assert.equal(documentState(cell("failed", false), undefined)?.label, "Run failed");
  });

  test("waits while the extraction is not known", () => {
    assert.equal(documentState(cell("succeeded"), undefined), null);
  });

  test("counts the records still to review", () => {
    const state = documentState(
      cell("succeeded"),
      extraction("suggested", "accepted", "suggested"),
    );
    assert.deepEqual(state, { kind: "to-review", label: "2 to review" });
  });

  test("says records reviewed when none is left", () => {
    const three = extraction("accepted", "rejected", "accepted");
    assert.equal(documentState(cell("succeeded"), three)?.label, "3 records reviewed");
    assert.equal(
      documentState(cell("succeeded"), extraction("accepted"))?.label,
      "1 record reviewed",
    );
  });

  test("says nothing found for an empty extraction", () => {
    assert.equal(documentState(cell("succeeded"), extraction())?.label, "Nothing found");
  });

  test("keeps a stale cell's records", () => {
    assert.equal(documentState(cell("stale"), extraction("suggested"))?.label, "1 to review");
  });
});
