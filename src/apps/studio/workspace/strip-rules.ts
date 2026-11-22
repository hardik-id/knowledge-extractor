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
