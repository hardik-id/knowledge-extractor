import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldValue,
  ReviewState,
} from "@/services/contracts";
import { fieldLabels } from "./labels";
import { buildReviewMarks } from "./review-marks";

const text = "# ADR 1\nStatus: Accepted\nDecided on 2026-01-05 by Ana.\n";

const definition: ExtractionDefinition = {
  version: 1,
  note: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  prompt: "",
  output: { format: "json", template: "" },
  recordTypes: [
    {
      id: "adr",
      name: "ADR",
      description: "",
      fields: ["status", "date"].map((k) => ({
        id: k,
        key: k,
        name: k,
        description: "",
        mode: "quote" as const,
        valueType: "text" as const,
        choices: [],
        multiple: false,
      })),
    },
  ],
};

const span = (quote: string) => ({
  start: text.indexOf(quote),
  end: text.indexOf(quote) + quote.length,
  quote,
});

const value = (
  id: string,
  fieldId: string,
  quote: string | null,
  extra: Partial<FieldValue> = {},
): FieldValue => ({
  id,
  fieldId,
  value: quote,
  spans: quote ? [span(quote)] : [],
  origin: "llm",
  review: "suggested" as ReviewState,
  anchored: true,
  ...extra,
});

const record = (fields: FieldValue[], withSpan = true): ExtractionRecord => ({
  id: "r1",
  fileId: "f",
  recordTypeId: "adr",
  span: withSpan ? span("# ADR 1") : null,
  fields,
  origin: "llm",
  review: "suggested",
  useAsExample: false,
});

describe("buildReviewMarks", () => {
  const labels = fieldLabels(definition);

  test("makes a mark per located span with the field's label", () => {
    const r = buildReviewMarks(text, labels, {
      records: [record([value("v1", "status", "Accepted")])],
    });
    assert.equal(r.marks.length, 1);
    const m = r.marks[0];
    assert.equal(text.slice(m.start, m.end), "Accepted");
    assert.equal(m.data.valueId, "v1");
    assert.equal(m.data.recordId, "r1");
    assert.equal(m.data.labelIndex, 1);
    assert.equal(m.data.name, "status");
    assert.ok(r.marked.has("v1"));
    assert.equal(r.recordStarts.get("r1"), 0);
  });

  test("uses the second label for the second field", () => {
    const r = buildReviewMarks(text, labels, {
      records: [record([value("v2", "date", "2026-01-05")])],
    });
    assert.equal(r.marks[0].data.labelIndex, 2);
  });

  test("skips rejected values and null values without reporting them", () => {
    const r = buildReviewMarks(text, labels, {
      records: [
        record([
          value("v1", "status", "Accepted", { review: "rejected" }),
          value("v2", "date", null),
        ]),
      ],
    });
    assert.equal(r.marks.length, 0);
    assert.equal(r.unanchored.size, 0);
  });

  test("reports a quote that is not in the text, and flagged values", () => {
    const missing = value("v1", "status", "Accepted", {
      spans: [{ start: 3, end: 9, quote: "Never written" }],
    });
    const flagged = value("v2", "date", "2026-01-05", { anchored: false });
    const r = buildReviewMarks(text, labels, { records: [record([missing, flagged])] });
    assert.equal(r.marks.length, 0);
    assert.deepEqual([...r.unanchored].sort(), ["v1", "v2"]);
    assert.equal(r.marked.size, 0);
  });

  test("a record without a span has no start", () => {
    const r = buildReviewMarks(text, labels, { records: [record([], false)] });
    assert.equal(r.recordStarts.size, 0);
  });
});
