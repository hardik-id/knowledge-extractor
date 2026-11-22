import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionDefinition, FieldDef } from "@/services/contracts";
import { fieldLabels, labelIndexAt, labelStyle } from "./labels";

const field = (id: string): FieldDef => ({
  id,
  key: id,
  name: id.toUpperCase(),
  description: "",
  mode: "quote",
  valueType: "text",
  choices: [],
  multiple: false,
});

const definition = (counts: number[]): ExtractionDefinition => {
  let n = 0;
  return {
    version: 1,
    note: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    prompt: "",
    output: { format: "json", template: "" },
    recordTypes: counts.map((count, t) => ({
      id: `t${t}`,
      name: `Type ${t}`,
      description: "",
      fields: Array.from({ length: count }, () => field(`f${n++}`)),
    })),
  };
};

describe("labelIndexAt", () => {
  test("runs 1 to 6 and cycles", () => {
    assert.deepEqual([0, 1, 5, 6, 7, 12].map(labelIndexAt), [1, 2, 6, 1, 2, 1]);
  });
  test("ignores nonsense", () => {
    assert.equal(labelIndexAt(-3), 1);
    assert.equal(labelIndexAt(Number.NaN), 1);
  });
});

describe("labelStyle", () => {
  test("gives literal class names for each of the six", () => {
    for (let i = 1; i <= 6; i++) {
      const s = labelStyle(i);
      assert.equal(s.index, i);
      assert.equal(s.highlight, `bg-label-${i}-soft`);
      assert.equal(s.underline, `border-label-${i}`);
      assert.ok(s.chip.includes(`text-label-${i}`));
    }
  });
  test("has a faded pair in the same colour for each of the six", () => {
    for (let i = 1; i <= 6; i++) {
      assert.equal(labelStyle(i).faded, `bg-label-${i}-soft/25 border-label-${i}/25`);
    }
  });
  test("wraps indices outside 1 to 6", () => {
    assert.equal(labelStyle(7).index, 1);
    assert.equal(labelStyle(0).index, 6);
  });
});

describe("fieldLabels", () => {
  test("numbers fields across record types and cycles after six", () => {
    const labels = fieldLabels(definition([4, 4]));
    assert.deepEqual(
      [...labels.values()].map((l) => l.index),
      [1, 2, 3, 4, 5, 6, 1, 2],
    );
    assert.equal(labels.get("f5")?.recordType.id, "t1");
  });
  test("is stable for the same definition", () => {
    const a = fieldLabels(definition([3]));
    const b = fieldLabels(definition([3]));
    assert.equal(a.get("f2")?.index, b.get("f2")?.index);
  });
});

describe("fieldLabels with a draft", () => {
  test("needs only the record types", () => {
    const { recordTypes } = definition([2, 1]);
    const labels = fieldLabels({ recordTypes });
    assert.deepEqual([...labels.keys()], ["f0", "f1", "f2"]);
    assert.equal(labels.get("f2")?.index, 3);
    assert.equal(labels.get("f2")?.recordType.id, "t1");
  });
});
