import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionRecord, FieldDef, FieldValue } from "@/services/contracts";
import {
  canEditValue,
  cleanEditedText,
  countReviews,
  reviewSummary,
  showValueState,
  sortRejectedLast,
  suggestedRecordIds,
  valuesAfterAdd,
  valuesAfterEdit,
  valuesAfterRemove,
} from "./record-rules";

const span = (quote: string) => ({ start: 0, end: quote.length, quote });
const value = (id: string, text: string | null, over: Partial<FieldValue> = {}): FieldValue => ({
  id,
  fieldId: "f",
  value: text,
  spans: text === null ? [] : [span(text)],
  origin: "llm",
  review: "suggested",
  anchored: true,
  ...over,
});
const record = (id: string, review: ExtractionRecord["review"]): ExtractionRecord => ({
  id,
  fileId: "file",
  recordTypeId: "t",
  span: null,
  fields: [],
  origin: "llm",
  review,
  useAsExample: false,
});
const field = (mode: FieldDef["mode"]): FieldDef => ({
  id: "f",
  key: "f",
  name: "F",
  description: "",
  mode,
  valueType: "text",
  choices: [],
  multiple: true,
});

describe("valuesAfterEdit", () => {
  it("changes one value, keeps its spans and passes the others through", () => {
    const values = [value("a", "x"), value("b", "y")];
    assert.deepEqual(valuesAfterEdit(values, "b", "z"), [
      { value: "x", spans: [span("x")] },
      { value: "z", spans: [span("y")] },
    ]);
  });
  it("fills a Not found placeholder and drops other placeholders", () => {
    const values = [value("a", null), value("b", null)];
    assert.deepEqual(valuesAfterEdit(values, "a", "new"), [{ value: "new", spans: [] }]);
  });
});

describe("valuesAfterRemove", () => {
  it("returns the rest, and an empty list for the last one", () => {
    const values = [value("a", "x"), value("b", "y")];
    assert.deepEqual(valuesAfterRemove(values, "a"), [{ value: "y", spans: [span("y")] }]);
    assert.deepEqual(valuesAfterRemove([value("a", "x")], "a"), []);
  });
  it("drops placeholders", () => {
    assert.deepEqual(valuesAfterRemove([value("a", "x"), value("n", null)], "a"), []);
  });
});

describe("valuesAfterAdd", () => {
  it("appends a value without spans", () => {
    assert.deepEqual(valuesAfterAdd([value("a", "x")], "y"), [
      { value: "x", spans: [span("x")] },
      { value: "y", spans: [] },
    ]);
    assert.deepEqual(valuesAfterAdd([], "y"), [{ value: "y", spans: [] }]);
  });
});

describe("canEditValue", () => {
  it("allows inferred values and Not found, not quote values", () => {
    assert.equal(canEditValue(field("inferred"), value("a", "x")), true);
    assert.equal(canEditValue(field("quote"), value("a", "x")), false);
    assert.equal(canEditValue(field("quote"), value("a", null)), true);
    assert.equal(canEditValue(field("quote"), null), true);
  });
});

describe("cleanEditedText", () => {
  it("trims and rejects empty text", () => {
    assert.equal(cleanEditedText("  hi "), "hi");
    assert.equal(cleanEditedText("   "), null);
  });
});

describe("review summary", () => {
  it("lists only the non-zero parts", () => {
    const records = [
      record("1", "accepted"),
      record("2", "accepted"),
      record("3", "suggested"),
      record("4", "rejected"),
    ];
    assert.equal(reviewSummary(countReviews(records)), "2 accepted · 1 suggested · 1 rejected");
    assert.equal(reviewSummary(countReviews([record("1", "suggested")])), "1 suggested");
    assert.equal(reviewSummary(countReviews([])), "");
  });
  it("finds the suggested ids in order", () => {
    assert.deepEqual(
      suggestedRecordIds([
        record("1", "suggested"),
        record("2", "accepted"),
        record("3", "suggested"),
      ]),
      ["1", "3"],
    );
  });
});

describe("sortRejectedLast", () => {
  it("moves rejected records to the end and keeps the order otherwise", () => {
    const items = [
      { record: record("1", "rejected") },
      { record: record("2", "suggested") },
      { record: record("3", "rejected") },
      { record: record("4", "accepted") },
    ];
    assert.deepEqual(
      sortRejectedLast(items).map((i) => i.record.id),
      ["2", "4", "1", "3"],
    );
  });
});

describe("showValueState", () => {
  it("is true only when the value differs from its record", () => {
    assert.equal(
      showValueState(value("a", "x", { review: "rejected" }), record("r", "suggested")),
      true,
    );
    assert.equal(showValueState(value("a", "x"), record("r", "suggested")), false);
  });
});
