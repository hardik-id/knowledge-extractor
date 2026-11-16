import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AnnotationOrigin, ExtractionRecord, FieldValue, ReviewState } from "../contracts";
import { mergeExtractedRecords } from "./extraction-merge";

let n = 0;
const value = (
  origin: AnnotationOrigin = "llm",
  review: ReviewState = "suggested",
): FieldValue => ({
  id: `v${++n}`,
  fieldId: "f",
  value: "x",
  spans: [],
  origin,
  review,
  anchored: true,
});

const record = (
  id: string,
  span: [number, number] | null,
  over: Partial<ExtractionRecord> = {},
): ExtractionRecord => ({
  id,
  fileId: "file",
  recordTypeId: "rt",
  span: span && { start: span[0], end: span[1], quote: "q" },
  fields: [value()],
  origin: "llm",
  review: "suggested",
  useAsExample: false,
  ...over,
});

const ids = (records: ExtractionRecord[]) => records.map((r) => r.id);

describe("mergeExtractedRecords", () => {
  test("an accepted record is kept unchanged and its fresh duplicate is not added", () => {
    const accepted = record("old", [10, 20], { review: "accepted" });
    const merged = mergeExtractedRecords(
      [accepted],
      [record("new", [12, 22]), record("other", [30, 40])],
    );
    assert.deepEqual(ids(merged), ["old", "other"]);
    assert.deepEqual(merged[0], accepted);
  });

  test("a rejected record stays rejected and is not suggested again", () => {
    const merged = mergeExtractedRecords(
      [record("old", [10, 20], { review: "rejected" })],
      [record("new", [10, 20])],
    );
    assert.deepEqual(ids(merged), ["old"]);
    assert.equal(merged[0].review, "rejected");
  });

  test("a record a person added survives", () => {
    const human = record("mine", null, { origin: "human", review: "accepted" });
    assert.deepEqual(ids(mergeExtractedRecords([human], [record("new", [1, 2])])), ["new", "mine"]);
  });

  test("untouched suggestions are replaced by the new run's, with new ids", () => {
    const merged = mergeExtractedRecords(
      [record("a", [1, 5]), record("b", [8, 9])],
      [record("c", [1, 5])],
    );
    assert.deepEqual(ids(merged), ["c"]);
  });

  test("a record with one human-edited value is kept whole", () => {
    const edited = record("old", [10, 20], { fields: [value(), value("human", "accepted")] });
    const merged = mergeExtractedRecords([edited], [record("new", [10, 20])]);
    assert.deepEqual(merged, [edited]);
  });

  test("a record whose value was only reviewed is kept", () => {
    const reviewed = record("old", [10, 20], { fields: [value("llm", "rejected")] });
    assert.deepEqual(ids(mergeExtractedRecords([reviewed], [])), ["old"]);
  });

  test("only records of the same type block each other, and a kept record without a span blocks nothing", () => {
    const kept = record("kept", [10, 20], { review: "accepted" });
    const noSpan = record("nospan", null, { review: "accepted" });
    const otherType = record("other-type", [10, 20], { recordTypeId: "rt2" });
    const merged = mergeExtractedRecords([kept, noSpan], [otherType, record("anywhere", [0, 100])]);
    assert.ok(ids(merged).includes("other-type"));
    assert.ok(!ids(merged).includes("anywhere"), "overlaps kept");
    const free = mergeExtractedRecords([noSpan], [record("x", [10, 20])]);
    assert.deepEqual(ids(free), ["x", "nospan"]);
  });

  test("spans that only touch do not overlap", () => {
    const kept = record("kept", [10, 20], { review: "accepted" });
    assert.deepEqual(ids(mergeExtractedRecords([kept], [record("next", [20, 30])])), [
      "kept",
      "next",
    ]);
  });

  test("the result is ordered by span start, no span last, stable otherwise", () => {
    const merged = mergeExtractedRecords(
      [record("h1", null, { origin: "human" }), record("h2", [50, 60], { origin: "human" })],
      [record("f2", [5, 6]), record("f1", null), record("f3", [5, 7])],
    );
    assert.deepEqual(ids(merged), ["f2", "f3", "h2", "h1", "f1"]);
  });
});
