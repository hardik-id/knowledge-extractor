import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ExtractionRecord, RecordType } from "@/services/contracts";
import { placeMenu, recordHeading, shortenQuote, valuesWithNew } from "./review-selection";

const span = (quote: string) => ({ start: 0, end: quote.length, quote });

function record(id: string, fields: { fieldId: string; value: string | null }[]): ExtractionRecord {
  return {
    id,
    recordTypeId: "adr",
    span: null,
    review: "suggested",
    origin: "human",
    useAsExample: false,
    fields: fields.map((f, i) => ({
      id: `${id}-v${i}`,
      fieldId: f.fieldId,
      value: f.value,
      spans: f.value ? [span(f.value)] : [],
      origin: "human",
      review: "accepted",
      anchored: true,
    })),
  } as unknown as ExtractionRecord;
}

describe("shortenQuote", () => {
  test("keeps short text and wraps it in quotes", () => {
    assert.equal(shortenQuote("Postgres"), "“Postgres”");
  });
  test("puts it on one line and cuts it", () => {
    assert.equal(
      shortenQuote("We store orders\nin Postgres because it is reliable", 18),
      "“We store orders in…”",
    );
  });
});

describe("valuesWithNew", () => {
  const rec = record("r1", [
    { fieldId: "tag", value: "a" },
    { fieldId: "tag", value: null },
    { fieldId: "title", value: "T" },
  ]);
  const added = { value: "b", span: span("b") };

  test("a field with one value is replaced", () => {
    assert.deepEqual(valuesWithNew(rec, { id: "title", multiple: false }, added), [
      { value: "b", spans: [span("b")] },
    ]);
  });
  test("a field with several values keeps its non-empty ones", () => {
    assert.deepEqual(valuesWithNew(rec, { id: "tag", multiple: true }, added), [
      { value: "a", spans: [span("a")] },
      { value: "b", spans: [span("b")] },
    ]);
  });
});

describe("recordHeading", () => {
  const type = { id: "adr", name: "ADR", description: "", fields: [{ id: "title" }] } as RecordType;
  test("uses the first field's value", () => {
    const r = record("r1", [{ fieldId: "title", value: " Use Postgres " }]);
    assert.equal(recordHeading(r, type, [r]), "Use Postgres");
  });
  test("falls back to the type's name and number", () => {
    const a = record("a", []);
    const b = record("b", []);
    assert.equal(recordHeading(b, type, [a, b]), "ADR 2");
  });
});

describe("placeMenu", () => {
  test("centres under the anchor", () => {
    assert.deepEqual(placeMenu({ anchor: { x: 300, bottom: 50 }, boxWidth: 800, menuWidth: 200 }), {
      left: 200,
      top: 58,
    });
  });
  test("stays inside the box", () => {
    assert.equal(
      placeMenu({ anchor: { x: 10, bottom: 0 }, boxWidth: 800, menuWidth: 200 }).left,
      0,
    );
    assert.equal(
      placeMenu({ anchor: { x: 790, bottom: 0 }, boxWidth: 800, menuWidth: 200 }).left,
      600,
    );
  });
  test("a box narrower than the menu pins it to the left", () => {
    assert.equal(
      placeMenu({ anchor: { x: 50, bottom: 0 }, boxWidth: 150, menuWidth: 200 }).left,
      0,
    );
  });
});
