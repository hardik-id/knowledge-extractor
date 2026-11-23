import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionDefinition } from "@/services/contracts";
import {
  addField,
  addRecordType,
  chunkingSummary,
  chunkSizeError,
  parseChunkSize,
  setChunkingSize,
  setChunkingStrategy,
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
  note: "",
  createdAt: "2026-01-01T00:00:00.000Z",
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
  chunking: { strategy: "auto" as const, size: null },
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

describe("chunking", () => {
  const draft = () => toDraft(saved);

  test("a version without chunking, or with a size on automatic, is the same as automatic: not dirty", () => {
    const old = { ...saved } as Partial<ExtractionDefinition>;
    delete old.chunking;
    const d = toDraft(old as ExtractionDefinition);
    assert.deepEqual(d.chunking, { strategy: "auto", size: null });
    assert.equal(isDirty(d, old as ExtractionDefinition), false);
    const odd = { ...saved, chunking: { strategy: "auto" as const, size: 3000 } };
    assert.equal(isDirty(toDraft(odd), odd), false);
    assert.deepEqual(toDraft(odd).chunking, { strategy: "auto", size: null });
  });

  test("a non-auto strategy takes 4000 when there is no size, and keeps the size it has", () => {
    const heading = setChunkingStrategy(draft(), "heading");
    assert.deepEqual(heading.chunking, { strategy: "heading", size: 4000 });
    const sized = setChunkingSize(heading, 2500);
    assert.deepEqual(setChunkingStrategy(sized, "fixed").chunking, {
      strategy: "fixed",
      size: 2500,
    });
  });

  test("automatic clears the size", () => {
    const d = setChunkingStrategy(
      setChunkingSize(setChunkingStrategy(draft(), "fixed"), 2500),
      "auto",
    );
    assert.deepEqual(d.chunking, { strategy: "auto", size: null });
  });

  test("a changed chunking is unsaved, and putting it back is not", () => {
    const d = setChunkingStrategy(draft(), "paragraph");
    assert.equal(isDirty(d, saved), true);
    assert.equal(isDirty(setChunkingStrategy(d, "auto"), saved), false);
  });

  test("the size box: empty and text are no size, other numbers are kept for validation", () => {
    assert.equal(parseChunkSize(""), null);
    assert.equal(parseChunkSize("  "), null);
    assert.equal(parseChunkSize("abc"), null);
    assert.equal(parseChunkSize("4000"), 4000);
    assert.equal(parseChunkSize("1500.5"), 1500.5);
  });

  test("validation: automatic has nothing to check; the size is a whole number from 1000 to 8000", () => {
    const withSize = (size: number | null) =>
      setChunkingSize(setChunkingStrategy(draft(), "fixed"), size);
    assert.equal(validateDraft(draft()).chunkSize, undefined);
    assert.equal(chunkSizeError({ strategy: "auto", size: null }), null);
    for (const ok of [1000, 4000, 8000]) {
      assert.equal(validateDraft(withSize(ok)).chunkSize, undefined, String(ok));
    }
    for (const bad of [null, 999, 8001, 1500.5, 0, -4000, Number.NaN]) {
      const errors = validateDraft(withSize(bad));
      assert.match(errors.chunkSize ?? "", /whole number from 1000 to 8000/, String(bad));
      assert.equal(isValid(errors), false);
    }
  });

  test("the closed row's text", () => {
    assert.equal(chunkingSummary({ strategy: "auto", size: null }), "Automatic");
    assert.equal(
      chunkingSummary({ strategy: "heading", size: 4000 }),
      "By heading, 4000 characters",
    );
    assert.equal(
      chunkingSummary({ strategy: "paragraph", size: 2000 }),
      "By paragraph, 2000 characters",
    );
    assert.equal(chunkingSummary({ strategy: "fixed", size: 8000 }), "Fixed size, 8000 characters");
    assert.equal(chunkingSummary({ strategy: "fixed", size: null }), "Fixed size");
  });
});
