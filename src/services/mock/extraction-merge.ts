import type { ExtractionRecord, TextSpan } from "../contracts";

/** Whether a person has had a hand in this record or any of its values. */
export function isTouchedByPerson(record: ExtractionRecord): boolean {
  return (
    record.origin === "human" ||
    record.review !== "suggested" ||
    record.fields.some((value) => value.origin === "human" || value.review !== "suggested")
  );
}

const overlaps = (a: TextSpan, b: TextSpan) => a.start < b.end && b.start < a.end;

/**
 * What an extraction run leaves behind when records already exist.
 * - Every record a person touched is kept as it is.
 * - Untouched suggestions from the earlier run are dropped.
 * - A fresh record is dropped when its span overlaps a kept record of the same
 *   record type: it is either already accepted or already rejected.
 * - The result is ordered by span start, records without a span last.
 */
export function mergeExtractedRecords(
  previous: ExtractionRecord[],
  fresh: ExtractionRecord[],
): ExtractionRecord[] {
  const kept = previous.filter(isTouchedByPerson);
  const added = fresh.filter(
    (record) =>
      !record.span ||
      !kept.some(
        (k) => k.recordTypeId === record.recordTypeId && k.span && overlaps(k.span, record.span!),
      ),
  );
  return [...kept, ...added]
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const as = a.record.span?.start ?? Infinity;
      const bs = b.record.span?.start ?? Infinity;
      return as === bs ? a.index - b.index : as < bs ? -1 : 1;
    })
    .map(({ record }) => record);
}
