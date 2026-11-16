import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionDefinition } from "@/services/contracts";
import {
  addField,
  addRecordType,
  deriveKey,
  isDirty,
  isValid,
  moveField,
  parseChoices,
  removeField,
  removeRecordType,
  toDraft,
  updateField,
  validateDraft,
} from "./definition-draft";

const saved: ExtractionDefinition = {
  version: 3,
  prompt: "Find ADRs",
  recordTypes: [
    {
      id: "t1",
      name: "ADR",
      description: "",
      fields: [
        {
          id: "f1",
          key: "title",
          name: "Title",
          description: "",
          mode: "quote",
          valueType: "text",
          choices: [],
          multiple: false,
        },
        {
          id: "f2",
          key: "status",
          name: "Status",
          description: "",
          mode: "inferred",
          valueType: "text",
          choices: [],
          multiple: false,
        },
      ],
    },
  ],
  output: { format: "json", template: "" },
};

describe("deriveKey", () => {
  test("lower case with underscores", () => {
    assert.equal(deriveKey("Approved by"), "approved_by");
    assert.equal(deriveKey("  Date / time!  "), "date_time");
  });
  test("unique", () => {
    assert.equal(deriveKey("Title", ["title"]), "title_2");
    assert.equal(deriveKey("Title", ["title", "title_2"]), "title_3");
  });
  test("never empty", () => {
    assert.equal(deriveKey("???"), "field");
  });
});

describe("draft editing", () => {
  test("toDraft drops the version and copies", () => {
    const d = toDraft(saved);
    assert.equal("version" in d, false);
    d.recordTypes[0]!.name = "x";
    assert.equal(saved.recordTypes[0]!.name, "ADR");
  });

  test("isDirty", () => {
    const d = toDraft(saved);
    assert.equal(isDirty(d, saved), false);
    assert.equal(isDirty({ ...d, prompt: "other" }, saved), true);
  });

  test("addField and removeField", () => {
    const d = addField(toDraft(saved), "t1");
    const fields = d.recordTypes[0]!.fields;
    assert.equal(fields.length, 3);
    assert.equal(fields[2]!.key, "field");
    const d2 = removeField(d, "t1", fields[2]!.id);
    assert.equal(d2.recordTypes[0]!.fields.length, 2);
  });

  test("moveField, and not past the ends", () => {
    const d = toDraft(saved);
    const down = moveField(d, "t1", "f1", 1);
    assert.deepEqual(
      down.recordTypes[0]!.fields.map((f) => f.id),
      ["f2", "f1"],
    );
    assert.deepEqual(
      moveField(d, "t1", "f1", -1).recordTypes[0]!.fields.map((f) => f.id),
      ["f1", "f2"],
    );
  });

  test("add and remove record type", () => {
    const d = addRecordType(toDraft(saved));
    assert.equal(d.recordTypes.length, 2);
    assert.equal(removeRecordType(d, d.recordTypes[1]!.id).recordTypes.length, 1);
  });

  test("renaming a field updates its key until the key is edited", () => {
    let d = updateField(toDraft(saved), "t1", "f1", { name: "Decision title" });
    assert.equal(d.recordTypes[0]!.fields[0]!.key, "decision_title");
    d = updateField(d, "t1", "f1", { key: "custom" });
    d = updateField(d, "t1", "f1", { name: "Something else" });
    assert.equal(d.recordTypes[0]!.fields[0]!.key, "custom");
  });

  test("a new field's key follows its name and avoids duplicates", () => {
    let d = addField(toDraft(saved), "t1");
    const id = d.recordTypes[0]!.fields[2]!.id;
    d = updateField(d, "t1", id, { name: "Title" });
    assert.equal(d.recordTypes[0]!.fields[2]!.key, "title_2");
  });

  test("parseChoices", () => {
    assert.deepEqual(parseChoices("a, b ,, c"), ["a", "b", "c"]);
    assert.deepEqual(parseChoices(""), []);
  });
});

describe("validateDraft", () => {
  test("a good draft is valid", () => {
    assert.equal(isValid(validateDraft(toDraft(saved))), true);
  });

  test("no record types", () => {
    const errors = validateDraft({ ...toDraft(saved), recordTypes: [] });
    assert.equal(isValid(errors), false);
    assert.equal(errors.general.length, 1);
  });

  test("empty names and keys", () => {
    let d = updateField(toDraft(saved), "t1", "f1", { name: "" });
    d = updateField(d, "t1", "f1", { key: " " });
    d.recordTypes[0]!.name = "";
    const errors = validateDraft(d);
    assert.ok(errors.types["t1"]);
    assert.ok(errors.fields["f1"]?.name);
    assert.ok(errors.fields["f1"]?.key);
  });

  test("duplicate keys are flagged on both fields", () => {
    const d = updateField(toDraft(saved), "t1", "f2", { key: "title" });
    const errors = validateDraft(d);
    assert.ok(errors.fields["f1"]?.key);
    assert.ok(errors.fields["f2"]?.key);
  });

  test("choice needs choices", () => {
    let d = updateField(toDraft(saved), "t1", "f2", { valueType: "choice" });
    assert.ok(validateDraft(d).fields["f2"]?.choices);
    d = updateField(d, "t1", "f2", { choices: ["Accepted"] });
    assert.equal(isValid(validateDraft(d)), true);
  });
});
