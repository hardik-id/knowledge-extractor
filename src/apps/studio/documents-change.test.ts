import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import type { ExtractionRecord, FileExtraction, RunFile } from "@/services/contracts";
import type { SourceFile } from "@/types/pipeline";
import {
  hasReviewedRecords,
  isRunBusy,
  removedFiles,
  removedWithReviewedRecords,
} from "./documents-change";

const record = (over: Partial<ExtractionRecord> = {}): ExtractionRecord => ({
  id: "r",
  fileId: "f",
  recordTypeId: "t",
  span: null,
  fields: [],
  origin: "llm",
  review: "suggested",
  useAsExample: false,
  ...over,
});
const extraction = (...records: ExtractionRecord[]): FileExtraction => ({
  fileId: "f",
  revision: 1,
  sourceEtag: "e",
  definitionVersion: 1,
  records,
});
const runFile = (id: string, sourceRef: string) => ({ id, sourceRef, name: id }) as RunFile;

describe("hasReviewedRecords", () => {
  test("untouched suggestions are not reviewed work", () => {
    assert.equal(hasReviewedRecords(extraction()), false);
    assert.equal(hasReviewedRecords(extraction(record())), false);
  });
  test("accepted, rejected or added records are", () => {
    assert.equal(hasReviewedRecords(extraction(record({ review: "accepted" }))), true);
    assert.equal(hasReviewedRecords(extraction(record({ review: "rejected" }))), true);
    assert.equal(hasReviewedRecords(extraction(record({ origin: "human" }))), true);
  });
  test("a value a person edited or reviewed is", () => {
    const value = { id: "v", fieldId: "x", value: "a", spans: [], anchored: true };
    assert.equal(
      hasReviewedRecords(
        extraction(record({ fields: [{ ...value, origin: "human", review: "suggested" }] })),
      ),
      true,
    );
    assert.equal(
      hasReviewedRecords(
        extraction(record({ fields: [{ ...value, origin: "llm", review: "accepted" }] })),
      ),
      true,
    );
  });
});

describe("removedFiles", () => {
  test("is what the selection leaves out, matched by the document id", () => {
    const files = [runFile("f1", "d1"), runFile("f2", "d2")];
    const selection = [{ id: "d2" }, { id: "d3" }] as SourceFile[];
    assert.deepEqual(
      removedFiles(files, selection).map((f) => f.id),
      ["f1"],
    );
  });
});

describe("removedWithReviewedRecords", () => {
  test("names only files with reviewed records; a file never extracted counts as none", async () => {
    const files = [runFile("a", "da"), runFile("b", "db"), runFile("c", "dc")];
    const byFile: Record<string, FileExtraction | null> = {
      a: extraction(record({ review: "accepted" })),
      b: extraction(record()),
      c: null,
    };
    const lost = await removedWithReviewedRecords(files, async (f) => byFile[f.id]);
    assert.deepEqual(
      lost.map((f) => f.id),
      ["a"],
    );
  });
});

describe("isRunBusy", () => {
  test("is the 409 for a run in progress only", () => {
    const error = (status: number, code: string) => new ApiError({ status, code, message: "" });
    assert.equal(isRunBusy(error(409, "execution_in_progress")), true);
    assert.equal(isRunBusy(error(409, "conflict")), false);
    assert.equal(isRunBusy(new Error("x")), false);
  });
});
