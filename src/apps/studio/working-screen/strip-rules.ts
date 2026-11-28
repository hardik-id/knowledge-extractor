import { locateSpan } from "@/lib/text-spans";
import type { ExtractionRecord, FieldDef, FieldValue, RecordType } from "@/services/contracts";

/** One value on its line, and what the line must say about it. */
export interface StripValue {
  value: FieldValue;
  /** Rejected: shown struck through, with the way back. */
  rejected: boolean;
  /** An exact quote, not rejected, that is highlighted in the document: its line leads there. */
  placed: boolean;
  /** An exact quote, not rejected, whose words are not in the text as written. */
  notInText: boolean;
}

/** A field of the type with its lines: no values at all means "Not found". */
export interface StripField {
  field: FieldDef;
  /** The field is not an exact quote: the model worked the value out. */
  workedOut: boolean;
  values: StripValue[];
}

/** An exact-quote value the model gave that is not in the text: flagged unanchored, or with no span. */
const unplaced = (value: FieldValue, text?: string) =>
  !value.anchored ||
  value.spans.length === 0 ||
  // With the document's text known: a span whose words cannot be found in it gets no highlight either.
  (text !== undefined && value.spans.some((span) => locateSpan(text, span) === null));

/**
 * The record strip's lines: every field of the type in the type's order, each with its real values
 * in this record (placeholders without a value are not values) and what each line says. `text` is
 * the document's text, to tell a quote that is placed from one that is not.
 */
export function stripFields(
  type: RecordType,
  record: ExtractionRecord,
  text?: string,
): StripField[] {
  return type.fields.map((field) => {
    const workedOut = field.mode === "inferred";
    const values = record.fields
      .filter((v) => v.fieldId === field.id && v.value !== null)
      .map((value) => {
        const rejected = value.review === "rejected";
        const quote = !workedOut && !rejected;
        const lost = quote && unplaced(value, text);
        return { value, rejected, placed: quote && !lost, notInText: lost };
      });
    return { field, workedOut, values };
  });
}

/** Whether the records come from an older version of the configuration than the saved one. */
export function fieldsChangedSinceRun(
  extraction: { definitionVersion: number } | undefined,
  savedVersion: number | undefined,
): boolean {
  return (
    !!extraction && savedVersion !== undefined && extraction.definitionVersion !== savedVersion
  );
}
