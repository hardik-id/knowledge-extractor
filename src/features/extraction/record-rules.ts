import type {
  ExtractionRecord,
  FieldDef,
  FieldValue,
  FieldValueInput,
  ReviewState,
} from "@/services/contracts";

/** What a field's value is edited with. */
export type EditorKind = "text" | "date" | "number" | "choice";

export function editorKind(field: FieldDef): EditorKind {
  return field.valueType;
}

/** A real value, as opposed to the "Not found" placeholder. */
const isReal = (v: FieldValue) => v.value !== null;

const asInput = (v: FieldValue): FieldValueInput => ({ value: v.value, spans: v.spans });

/**
 * Whether a value can be typed by hand. Inferred values can. A "Not found"
 * placeholder can too, whatever the field's mode. Other quote values are
 * whatever was selected in the document.
 */
export function canEditValue(field: FieldDef, value: FieldValue | null): boolean {
  if (value === null || value.value === null) return true;
  return field.mode === "inferred";
}

/** All values of a field after one is changed to `text`. Spans of the edited value are kept. */
export function valuesAfterEdit(
  values: FieldValue[],
  valueId: string,
  text: string,
): FieldValueInput[] {
  const next: FieldValueInput[] = [];
  for (const v of values) {
    if (v.id === valueId) next.push({ value: text, spans: v.spans });
    else if (isReal(v)) next.push(asInput(v));
  }
  return next;
}

/** All values of a field after one is removed. May be empty: the field is then "Not found". */
export function valuesAfterRemove(values: FieldValue[], valueId: string): FieldValueInput[] {
  return values.filter((v) => v.id !== valueId && isReal(v)).map(asInput);
}

/** All values of a field after a first value is typed for a field that had none. */
export function valuesAfterAdd(values: FieldValue[], text: string): FieldValueInput[] {
  return [...values.filter(isReal).map(asInput), { value: text, spans: [] }];
}

/** The text to save from an editor, or null when it is empty. */
export function cleanEditedText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

export type ReviewCounts = Record<ReviewState, number>;

export function countReviews(records: ExtractionRecord[]): ReviewCounts {
  const counts: ReviewCounts = { suggested: 0, accepted: 0, rejected: 0 };
  for (const r of records) counts[r.review] += 1;
  return counts;
}

/** "2 accepted · 1 suggested · 1 rejected": only the parts that are not zero. */
export function reviewSummary(counts: ReviewCounts): string {
  return (["accepted", "suggested", "rejected"] as const)
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`)
    .join(" · ");
}

/** Rejected records after the others; each part keeps its order. */
export function sortRejectedLast<T extends { record: ExtractionRecord }>(items: T[]): T[] {
  const rank = (i: T) => (i.record.review === "rejected" ? 1 : 0);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Whether a value should name its own review state: only when it differs from its record's. */
export function showValueState(value: FieldValue, record: ExtractionRecord): boolean {
  return value.review !== record.review;
}

export function suggestedRecordIds(records: ExtractionRecord[]): string[] {
  return records.filter((r) => r.review === "suggested").map((r) => r.id);
}
