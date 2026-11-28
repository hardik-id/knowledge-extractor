import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Draft } from "@/features/extraction/definition-draft";
import { configurationSummary } from "./configuration-summary";

type Input = Parameters<typeof configurationSummary>[0];

const auto: Draft["chunking"] = { strategy: "auto", size: null };
const type = (name: string, fields: number) =>
  ({
    id: name,
    name,
    description: "",
    fields: Array.from({ length: fields }, (_, i) => ({ id: `${name}${i}` })),
  }) as unknown as Draft["recordTypes"][number];
const draft = (recordTypes: Draft["recordTypes"], prompt = "", chunking = auto): Input => ({
  recordTypes,
  prompt,
  chunking,
});

describe("configurationSummary", () => {
  test("says nothing is configured for an empty definition", () => {
    assert.equal(configurationSummary(draft([])), "Nothing configured yet");
    assert.equal(configurationSummary(draft([], "  ")), "Nothing configured yet");
  });

  test("names the one record type, its fields and the chunking", () => {
    assert.equal(
      configurationSummary(draft([type("ADR", 5)], "x")),
      "ADR · 5 fields · Automatic chunking",
    );
    assert.equal(
      configurationSummary(draft([type("ADR", 1)])),
      "ADR · 1 field · Automatic chunking",
    );
  });

  test("counts the record types when there are several", () => {
    assert.equal(
      configurationSummary(draft([type("A", 4), type("B", 5)])),
      "2 record types · 9 fields · Automatic chunking",
    );
  });

  test("says what a prompt alone has", () => {
    assert.equal(
      configurationSummary(draft([], "Find the decisions")),
      "0 fields · Automatic chunking",
    );
  });

  test("spells out a chosen chunking", () => {
    assert.equal(
      configurationSummary(draft([type("ADR", 2)], "", { strategy: "paragraph", size: 4000 })),
      "ADR · 2 fields · Chunking: by paragraph, 4000 characters",
    );
  });

  test("adds the suggested changes while a suggestion waits", () => {
    assert.equal(
      configurationSummary(draft([type("ADR", 5)]), 3),
      "ADR · 5 fields · Automatic chunking · 3 suggested changes",
    );
    assert.match(configurationSummary(draft([type("ADR", 5)]), 1), /· 1 suggested change$/);
    assert.equal(
      configurationSummary(draft([]), 2),
      "Nothing configured yet · 2 suggested changes",
    );
  });
});
