import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionRecord, FieldValue } from "@/services/contracts";
import { scrollTargetValueId } from "./field-selection-rules";

const value = (id: string, fieldId: string, patch: Partial<FieldValue> = {}): FieldValue => ({
  id,
  fieldId,
  value: "x",
  spans: [{ start: 0, end: 1, quote: "x" }],
  origin: "llm",
  review: "suggested",
  anchored: true,
  ...patch,
});
const record = (id: string, fields: FieldValue[], recordTypeId = "t1"): ExtractionRecord => ({
  id,
  fileId: "d",
  recordTypeId,
  span: null,
  fields,
  origin: "llm",
  review: "suggested",
  useAsExample: false,
});

describe("scrollTargetValueId", () => {
  const records = [
    record("r1", [value("v1", "other")]),
    record("r2", [value("v2", "f1"), value("v2b", "f1")]),
    record("r3", [value("v3", "f1")]),
  ];

  test("is the field's first located value in the current record", () => {
    assert.equal(scrollTargetValueId(records, "t1", "r3", "f1"), "v3");
    assert.equal(scrollTargetValueId(records, "t1", "r2", "f1"), "v2");
  });

  test("falls back to the first record that has one", () => {
    assert.equal(scrollTargetValueId(records, "t1", "r1", "f1"), "v2");
    assert.equal(scrollTargetValueId(records, "t1", null, "f1"), "v2");
  });

  test("skips rejected, unanchored and span-less values", () => {
    const some = [
      record("r1", [
        value("a", "f1", { review: "rejected" }),
        value("b", "f1", { anchored: false }),
        value("c", "f1", { spans: [] }),
      ]),
      record("r2", [value("d", "f1")]),
    ];
    assert.equal(scrollTargetValueId(some, "t1", "r1", "f1"), "d");
  });

  test("ignores records of another type", () => {
    const other = [record("r1", [value("v1", "f1")], "t2")];
    assert.equal(scrollTargetValueId(other, "t1", "r1", "f1"), null);
  });

  test("is null with no field, no records or no value", () => {
    assert.equal(scrollTargetValueId(records, "t1", "r1", null), null);
    assert.equal(scrollTargetValueId(undefined, "t1", "r1", "f1"), null);
    assert.equal(scrollTargetValueId(records, "t1", "r1", "missing"), null);
  });
});
