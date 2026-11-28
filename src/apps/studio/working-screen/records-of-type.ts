import type { ExtractionRecord } from "@/services/contracts";

/**
 * The records of one type in the order the strip walks them: the order of the extraction, with
 * rejected records last (each part keeps its order).
 */
export function recordsOfType(
  records: readonly ExtractionRecord[],
  typeId: string | null,
): ExtractionRecord[] {
  const own = records.filter((r) => r.recordTypeId === typeId);
  const rank = (r: ExtractionRecord) => (r.review === "rejected" ? 1 : 0);
  return [...own].sort((a, b) => rank(a) - rank(b));
}

/** The index of the record in the list, or -1 when it is not there (or none is current). */
export function indexOfRecord(
  list: readonly Pick<ExtractionRecord, "id">[],
  recordId: string | null,
): number {
  return recordId === null ? -1 : list.findIndex((r) => r.id === recordId);
}

/** The id of the record before or after the current one, or null at either end. */
export function neighbourId(
  list: readonly Pick<ExtractionRecord, "id">[],
  recordId: string | null,
  direction: "previous" | "next",
): string | null {
  const index = indexOfRecord(list, recordId);
  if (index < 0) return null;
  return list[index + (direction === "next" ? 1 : -1)]?.id ?? null;
}
