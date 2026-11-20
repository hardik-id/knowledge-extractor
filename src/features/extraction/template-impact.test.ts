import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionRecord } from "@/services/contracts";
import { isTouchedByPerson, recordsImpact } from "./template-impact";

function record(over: Partial<ExtractionRecord> = {}): ExtractionRecord {
  return {
    id: "r",
    fileId: "f",
    recordTypeId: "adr",
    span: null,
    fields: [],
    origin: "llm",
    review: "suggested",
    useAsExample: false,
    ...over,
  };
}

describe("recordsImpact", () => {
  test("no records, no sentence", () => {
    assert.equal(recordsImpact([], new Set(["adr"])), null);
  });

  test("only untouched suggestions are replaced", () => {
    assert.equal(
      recordsImpact([record()], new Set(["rule"])),
      "The next run replaces the suggestions nobody has reviewed.",
    );
  });

  test("a reviewed record of a type that is gone stays without a record type", () => {
    const text = recordsImpact([record({ review: "accepted" }), record()], new Set(["rule"]));
    assert.match(text!, /^1 record you reviewed or added belongs to a record type this template/);
    assert.match(text!, /without a record type/);
    assert.match(text!, /replaces the suggestions nobody has reviewed/);
  });

  test("reviewed records of a type that stays are simply kept", () => {
    assert.equal(
      recordsImpact([record({ origin: "human" })], new Set(["adr"])),
      "The records you reviewed or added stay at the next run.",
    );
  });

  test("an edited value counts as touched", () => {
    const edited = record({
      fields: [{ origin: "human", review: "suggested" } as ExtractionRecord["fields"][number]],
    });
    assert.equal(isTouchedByPerson(edited), true);
  });
});
