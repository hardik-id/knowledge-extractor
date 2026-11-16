import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import { MOCK_FILES } from "@/mocks/files";
import { mockEnrichedMarkdownFor } from "@/mocks/markdown";
import type { ExtractionDefinitionDraft, ExtractionRecord } from "../contracts";
import { extractRecords } from "./mock-extractor";

const fileNamed = (name: string) => MOCK_FILES.find((f) => f.name === name)!;
const DECISIONS = fileNamed("Architecture decisions 2026.pdf");
const PLATFORM = fileNamed("Platform ADRs.pptx");

let counter = 0;
const newId = () => `id-${++counter}`;
const extract = (
  text: string,
  definition: ExtractionDefinitionDraft = DEFAULT_EXTRACTION_DEFINITION,
) => extractRecords(text, definition, { fileId: "f1", newId });

const byCodePoints = (text: string, start: number, end: number) =>
  [...text].slice(start, end).join("");

const field = (record: ExtractionRecord, key: string) => {
  const id = DEFAULT_EXTRACTION_DEFINITION.recordTypes[0].fields.find((f) => f.key === key)!.id;
  return record.fields.filter((f) => f.fieldId === id);
};

describe("extractRecords", () => {
  const text = mockEnrichedMarkdownFor(DECISIONS);
  const records = extract(text);

  test("finds the three ADRs of the sample, in order", () => {
    assert.equal(records.length, 3);
    assert.deepEqual(
      records.map((r) => field(r, "title")[0].value),
      [
        "Use Postgres for the orders service",
        "Adopt OpenTelemetry for tracing",
        "Retire the legacy SOAP gateway",
      ],
    );
    assert.ok(records.every((r) => r.origin === "llm" && r.review === "suggested"));
    assert.ok(records.every((r) => r.span?.quote.startsWith("## ADR-")));
  });

  test("every span's quote is the text at its code point offsets, past the emoji too", () => {
    assert.ok(text.length > [...text].length, "the sample has a character outside the BMP");
    for (const sample of [DECISIONS, PLATFORM]) {
      const t = mockEnrichedMarkdownFor(sample);
      for (const record of extract(t)) {
        const spans = [record.span!, ...record.fields.flatMap((f) => f.spans)];
        for (const s of spans) assert.equal(byCodePoints(t, s.start, s.end), s.quote);
        assert.ok(record.fields.every((f) => f.anchored));
      }
    }
  });

  test("a multiple field gives one value per approver", () => {
    assert.deepEqual(
      field(records[0], "approved_by").map((v) => v.value),
      ["J. Smit", "A. de Vries"],
    );
    assert.deepEqual(
      field(records[2], "approved_by").map((v) => v.value),
      ["M. Jansen"],
    );
  });

  test("a missing field gives one null value without spans", () => {
    const missing = field(records[1], "approved_by");
    assert.equal(missing.length, 1);
    assert.equal(missing[0].value, null);
    assert.deepEqual(missing[0].spans, []);
    assert.equal(missing[0].anchored, true);
  });

  test("inferred values are normalised and keep their evidence", () => {
    assert.deepEqual(
      records.map((r) => field(r, "status")[0].value),
      ["accepted", "proposed", "superseded"],
    );
    assert.deepEqual(
      records.map((r) => field(r, "decided_on")[0].value),
      ["2026-11-03", "2026-11-10", "2026-09-14"],
    );
    assert.equal(field(records[0], "status")[0].spans[0].quote, "Accepted");
    assert.equal(field(records[0], "decided_on")[0].spans[0].quote, "3 November 2026");
  });

  test("quote fields hold the exact text of sections", () => {
    assert.equal(
      field(records[0], "decision")[0].value,
      "We store orders in Postgres and drop the document store pilot.",
    );
  });

  test("another record type name finds nothing; an unknown field gives null", () => {
    const [adr] = DEFAULT_EXTRACTION_DEFINITION.recordTypes;
    const other: ExtractionDefinitionDraft = {
      ...DEFAULT_EXTRACTION_DEFINITION,
      recordTypes: [{ ...adr, id: "rt-x", name: "Policy" }],
    };
    assert.deepEqual(extract(text, other), []);

    const extra: ExtractionDefinitionDraft = {
      ...DEFAULT_EXTRACTION_DEFINITION,
      recordTypes: [
        {
          ...adr,
          fields: [{ ...adr.fields[0], id: "f-x", key: "owner", name: "Owner" }],
        },
      ],
    };
    const result = extract(text, extra);
    assert.equal(result.length, 3);
    assert.ok(result.every((r) => r.fields.length === 1 && r.fields[0].value === null));
  });

  test("a record type without fields is just its block", () => {
    const [adr] = DEFAULT_EXTRACTION_DEFINITION.recordTypes;
    const result = extract(text, {
      ...DEFAULT_EXTRACTION_DEFINITION,
      recordTypes: [{ ...adr, fields: [] }],
    });
    assert.equal(result.length, 3);
    assert.ok(result.every((r) => r.fields.length === 0 && r.span));
  });

  test("a file without ADRs gives no records", () => {
    assert.deepEqual(extract(mockEnrichedMarkdownFor(MOCK_FILES[0])), []);
  });

  test("unanchorFirst alters the first quote value only", () => {
    const result = extractRecords(text, DEFAULT_EXTRACTION_DEFINITION, {
      fileId: "f1",
      newId,
      unanchorFirst: true,
    });
    const unanchored = result.flatMap((r) => r.fields).filter((f) => !f.anchored);
    assert.equal(unanchored.length, 1);
    assert.ok(!text.includes(unanchored[0].value!));
    assert.equal(unanchored[0], result[0].fields[0]);
  });
});
