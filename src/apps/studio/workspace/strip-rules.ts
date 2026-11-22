import type { ExtractionRecord, FieldDef, FieldValue, RecordType } from "@/services/contracts";

/** A field of the record with the values it has (real ones only). */
export interface FieldWithValues {
  field: FieldDef;
  values: FieldValue[];
}

const real = (value: FieldValue) => value.value !== null;

/** The fields in the type's order, each with its real values in this record. */
function fieldsWithValues(type: RecordType, record: ExtractionRecord): FieldWithValues[] {
  return type.fields.map((field) => ({
    field,
    values: record.fields.filter((v) => v.fieldId === field.id && real(v)),
  }));
}

/**
 * "Worked out by the model": the fields that are not exact quotes and have a value in this record.
 * A rejected value counts: it is shown as rejected.
 */
export function workedOutFields(type: RecordType, record: ExtractionRecord): FieldWithValues[] {
  return fieldsWithValues(type, record).filter(
    ({ field, values }) => field.mode === "inferred" && values.length > 0,
  );
}

/** An exact-quote value the model gave that is not in the text: flagged unanchored, or with no span. */
const unplaced = (value: FieldValue) => !value.anchored || value.spans.length === 0;

/** Keeps the exact-quote fields that still have a value after the filter. */
function quoteValues(
  type: RecordType,
  record: ExtractionRecord,
  keep: (value: FieldValue) => boolean,
): FieldWithValues[] {
  return fieldsWithValues(type, record)
    .filter(({ field }) => field.mode !== "inferred")
    .map(({ field, values }) => ({ field, values: values.filter(keep) }))
    .filter(({ values }) => values.length > 0);
}

/**
 * "Not placed in the document": exact-quote values that are not rejected and cannot be shown as a
 * highlight (the words are not in the text as written).
 */
export function unplacedQuoteFields(type: RecordType, record: ExtractionRecord): FieldWithValues[] {
  return quoteValues(type, record, (v) => v.review !== "rejected" && unplaced(v));
}

/** "Rejected": exact-quote values that were rejected, placed or not (they have no highlight). */
export function rejectedQuoteFields(type: RecordType, record: ExtractionRecord): FieldWithValues[] {
  return quoteValues(type, record, (v) => v.review === "rejected");
}

/** "Not found": the fields with no value at all in this record. A rejected value is a value. */
export function notFoundFields(type: RecordType, record: ExtractionRecord): FieldDef[] {
  return fieldsWithValues(type, record)
    .filter(({ values }) => values.length === 0)
    .map(({ field }) => field);
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
