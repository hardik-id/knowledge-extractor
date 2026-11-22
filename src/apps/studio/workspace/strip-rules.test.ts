import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionRecord, FieldDef, FieldValue, RecordType } from "@/services/contracts";
import { fieldsChangedSinceRun, notFoundFields, workedOutFields } from "./strip-rules";

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

describe("workedOutFields", () => {
  it("lists the inferred fields that have a value, in the type's order", () => {
    const list = workedOutFields(
      type,
      record([value("1", "summary", "S"), value("2", "title", "T"), value("3", "status", "open")]),
    );
    assert.deepEqual(
      list.map((l) => l.field.id),
      ["status", "summary"],
    );
  });

  it("leaves out exact quotes, empty fields and placeholders", () => {
    const list = workedOutFields(
      type,
      record([value("1", "title", "T"), value("2", "status", null)]),
    );
    assert.deepEqual(list, []);
  });

  it("keeps a rejected value: it is shown as rejected", () => {
    const list = workedOutFields(type, record([value("1", "status", "open", "rejected")]));
    assert.equal(list[0].values[0].review, "rejected");
  });
});

describe("notFoundFields", () => {
  it("names the fields with no value", () => {
    const list = notFoundFields(
      type,
      record([value("1", "title", "T"), value("2", "status", null)]),
    );
    assert.deepEqual(
      list.map((f) => f.id),
      ["status", "summary"],
    );
  });

  it("does not name a field whose value was rejected", () => {
    const list = notFoundFields(type, record([value("1", "title", "T", "rejected")]));
    assert.deepEqual(
      list.map((f) => f.id),
      ["status", "summary"],
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
