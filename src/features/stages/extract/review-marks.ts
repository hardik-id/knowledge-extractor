import type { HighlightData } from "@/components/pipeline/annotated-text";
import { locateSpan, type Mark } from "@/lib/text-spans";
import type { ExtractionRecord, FileExtraction } from "@/services/contracts";
import type { FieldLabel } from "./labels";

export interface ReviewMarks {
  marks: Mark<HighlightData>[];
  /** Values with something to show in the text. */
  marked: Set<string>;
  /** Values the model gave a quote for that is not in the text. */
  unanchored: Set<string>;
  /** Where each record's whole block starts in the text (string index), when it can be found. */
  recordStarts: Map<string, number>;
}

/**
 * The highlights of one file: a mark for every located span of every value
 * that was not rejected. A value with a span that can't be found, or flagged
 * `anchored: false`, gets no mark at all and is reported in `unanchored`.
 * Record spans are not painted; they only say where a record starts.
 */
export function buildReviewMarks(
  text: string,
  labels: Map<string, FieldLabel>,
  extraction: Pick<FileExtraction, "records">,
): ReviewMarks {
  const result: ReviewMarks = {
    marks: [],
    marked: new Set(),
    unanchored: new Set(),
    recordStarts: new Map(),
  };

  for (const record of extraction.records) {
    addRecord(text, labels, record, result);
  }
  return result;
}

function addRecord(
  text: string,
  labels: Map<string, FieldLabel>,
  record: ExtractionRecord,
  result: ReviewMarks,
): void {
  if (record.span) {
    const at = locateSpan(text, record.span);
    if (at) result.recordStarts.set(record.id, at.start);
  }

  for (const value of record.fields) {
    const label = labels.get(value.fieldId);
    if (!label || value.review === "rejected") continue;
    if (value.spans.length === 0) continue;

    const located = value.spans.map((span) => locateSpan(text, span));
    if (!value.anchored || located.some((at) => at === null)) {
      result.unanchored.add(value.id);
      continue;
    }

    located.forEach((at, i) => {
      if (!at) return;
      result.marks.push({
        start: at.start,
        end: at.end,
        data: {
          id: `${value.id}:${i}`,
          valueId: value.id,
          recordId: record.id,
          fieldId: value.fieldId,
          labelIndex: label.index,
          name: label.field.name,
          mode: label.field.mode,
          start: at.start,
          end: at.end,
        },
      });
    });
    result.marked.add(value.id);
  }
}
