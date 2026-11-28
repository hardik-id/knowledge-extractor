import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionRecord, FieldDef, FieldValue, RecordType } from "@/services/contracts";
import { fieldsChangedSinceRun, stripFields } from "./strip-rules";

const field = (id: string, mode: FieldDef["mode"]): FieldDef => ({
  id,
  key: id,
  name: id.toUpperCase(),
  description: "",
  mode,
  valueType: "text",
  choices: [],
  multiple: false,
});
const type: RecordType = {
  id: "t",
  name: "ADR",
  fields: [field("title", "quote"), field("status", "inferred"), field("summary", "inferred")],
} as RecordType;
const value = (
  id: string,
  fieldId: string,
  text: string | null,
  review: FieldValue["review"] = "suggested",
): FieldValue => ({
  id,
  fieldId,
  value: text,
  spans: [],
  origin: "llm",
  review,
  anchored: true,
});
const record = (fields: FieldValue[]): ExtractionRecord => ({
  id: "r",
  fileId: "f",
  recordTypeId: "t",
  span: null,
  fields,
  origin: "llm",
  review: "suggested",
  useAsExample: false,
});

const placed = (id: string, text: string, review: FieldValue["review"] = "suggested") => ({
  ...value(id, "title", text, review),
  spans: [{ start: 0, end: 1 }] as FieldValue["spans"],
});
const loose = (id: string, text: string, review: FieldValue["review"] = "suggested") => ({
  ...placed(id, text, review),
  anchored: false,
});
const of = (list: ReturnType<typeof stripFields>, id: string) =>
  list.find((l) => l.field.id === id)!;

describe("stripFields", () => {
  it("lists every field of the type in the type's order, with or without values", () => {
    const list = stripFields(type, record([value("1", "summary", "S"), placed("2", "T")]));
    assert.deepEqual(
      list.map((l) => l.field.id),
      ["title", "status", "summary"],
    );
    assert.equal(of(list, "status").values.length, 0);
  });

  it("marks the fields that are not exact quotes as worked out", () => {
    const list = stripFields(type, record([]));
    assert.deepEqual(
      list.map((l) => l.workedOut),
      [false, true, true],
    );
  });

  it("gives a field with several values one entry per value, in the record's order", () => {
    const list = stripFields(
      type,
      record([value("1", "summary", "A"), value("2", "title", "T"), value("3", "summary", "B")]),
    );
    assert.deepEqual(
      of(list, "summary").values.map((v) => v.value.id),
      ["1", "3"],
    );
  });

  it("leaves out placeholders without a value: the field then has no value", () => {
    const list = stripFields(type, record([value("1", "status", null)]));
    assert.deepEqual(of(list, "status").values, []);
  });

  it("a placed quote is placed and carries no note", () => {
    const [v] = of(stripFields(type, record([placed("1", "T")])), "title").values;
    assert.deepEqual([v.placed, v.notInText, v.rejected], [true, false, false]);
  });

  it("a rejected quote is rejected, whether it was placed or not, and is neither placed nor lost", () => {
    for (const quote of [placed("1", "T", "rejected"), loose("2", "T", "rejected")]) {
      const [v] = of(stripFields(type, record([quote])), "title").values;
      assert.deepEqual([v.placed, v.notInText, v.rejected], [false, false, true]);
    }
  });

  it("a quote that is flagged, or has no span, is not in the document", () => {
    const list = stripFields(type, record([loose("1", "T"), value("2", "title", "U")]));
    assert.deepEqual(
      of(list, "title").values.map((v) => [v.placed, v.notInText]),
      [
        [false, true],
        [false, true],
      ],
    );
  });

  it("with the text known, a quote whose words cannot be found is not in the document", () => {
    const found = { ...placed("1", "T"), spans: [{ start: 0, end: 5, quote: "Hello" }] };
    const lost = { ...placed("2", "U"), spans: [{ start: 0, end: 5, quote: "Gone!" }] };
    const list = stripFields(type, record([found, lost]), "Hello world");
    assert.deepEqual(
      of(list, "title").values.map((v) => [v.value.id, v.placed, v.notInText]),
      [
        ["1", true, false],
        ["2", false, true],
      ],
    );
  });

  it("a worked-out value is never placed or lost; a rejected one is rejected", () => {
    const list = stripFields(
      type,
      record([
        { ...value("1", "status", "open", "rejected"), anchored: false },
        { ...value("2", "summary", "S"), anchored: false },
      ]),
    );
    assert.deepEqual(
      of(list, "status").values.map((v) => [v.placed, v.notInText, v.rejected]),
      [[false, false, true]],
    );
    assert.deepEqual(
      of(list, "summary").values.map((v) => [v.placed, v.notInText, v.rejected]),
      [[false, false, false]],
    );
  });
});

describe("fieldsChangedSinceRun", () => {
  it("is true when the run used another version than the saved one", () => {
    assert.equal(fieldsChangedSinceRun({ definitionVersion: 1 }, 2), true);
    assert.equal(fieldsChangedSinceRun({ definitionVersion: 2 }, 2), false);
  });

  it("is false while either is unknown", () => {
    assert.equal(fieldsChangedSinceRun(undefined, 2), false);
    assert.equal(fieldsChangedSinceRun({ definitionVersion: 1 }, undefined), false);
  });
});
