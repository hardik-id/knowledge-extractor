import type { ExtractionRecord } from "@/services/contracts";

/** The first value of the field that has a place in the text: not rejected, anchored, with a span. */
function locatedValueId(record: ExtractionRecord, fieldId: string): string | null {
  const value = record.fields.find(
    (v) => v.fieldId === fieldId && v.review !== "rejected" && v.anchored && v.spans.length > 0,
  );
  return value?.id ?? null;
}

/**
 * The value the document scrolls to for the selected field: its first located value in the
 * current record, or else in the first record of the type that has one. Null when there is none.
 */
export function scrollTargetValueId(
  records: readonly ExtractionRecord[] | undefined,
  typeId: string | null,
  currentRecordId: string | null,
  fieldId: string | null,
): string | null {
  if (!fieldId || !records) return null;
  const ofType = records.filter((r) => r.recordTypeId === typeId);
  const current = ofType.find((r) => r.id === currentRecordId);
  if (current) {
    const here = locatedValueId(current, fieldId);
    if (here) return here;
  }
  for (const record of ofType) {
    const found = locatedValueId(record, fieldId);
    if (found) return found;
  }
  return null;
}

/** True when an open menu or dialog should get the Esc key before the field selection does. */
export function overlayIsOpen(root: ParentNode): boolean {
  return root.querySelector('[role="menu"], [role="listbox"], [role="dialog"]') !== null;
}
