import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionRecord } from "@/services/contracts";
import { indexOfRecord, neighbourId, recordsOfType } from "./records-of-type";

const record = (
  id: string,
  review: ExtractionRecord["review"] = "suggested",
  recordTypeId = "t1",
): ExtractionRecord => ({
  id,
  fileId: "f",
  recordTypeId,
  span: null,
  fields: [],
  origin: "llm",
  review,
  useAsExample: false,
});

describe("recordsOfType", () => {
  it("keeps the records of the type, in order", () => {
    const list = recordsOfType([record("a"), record("x", "suggested", "t2"), record("b")], "t1");
    assert.deepEqual(
      list.map((r) => r.id),
      ["a", "b"],
    );
  });

  it("puts rejected records last, each part keeping its order", () => {
    const list = recordsOfType(
      [record("a", "rejected"), record("b"), record("c", "rejected"), record("d", "accepted")],
      "t1",
    );
    assert.deepEqual(
      list.map((r) => r.id),
      ["b", "d", "a", "c"],
    );
  });

  it("gives nothing for no type or a type without records", () => {
    assert.deepEqual(recordsOfType([record("a")], null), []);
    assert.deepEqual(recordsOfType([record("a")], "t9"), []);
  });
});

describe("indexOfRecord and neighbourId", () => {
  const list = [record("a"), record("b"), record("c")];

  it("finds the index, or -1", () => {
    assert.equal(indexOfRecord(list, "b"), 1);
    assert.equal(indexOfRecord(list, "z"), -1);
    assert.equal(indexOfRecord(list, null), -1);
  });

  it("walks to the previous and the next record", () => {
    assert.equal(neighbourId(list, "b", "next"), "c");
    assert.equal(neighbourId(list, "b", "previous"), "a");
  });

  it("stops at both ends and when the record is not in the list", () => {
    assert.equal(neighbourId(list, "a", "previous"), null);
    assert.equal(neighbourId(list, "c", "next"), null);
    assert.equal(neighbourId(list, "z", "next"), null);
    assert.equal(neighbourId(list, null, "next"), null);
  });
});
