import { plural } from "@/lib/format";
import type { ExtractionRecord } from "@/services/contracts";

/** The run keeps a record a person added, accepted, rejected or edited (the backend's merge rule). */
export function isTouchedByPerson(record: ExtractionRecord): boolean {
  return (
    record.origin === "human" ||
    record.review !== "suggested" ||
    record.fields.some((value) => value.origin === "human" || value.review !== "suggested")
  );
}

/**
 * What loading a configuration with these record types does to the workspace's
 * records at the next run, in plain words; null when there are none. The run
 * keeps what a person worked on, even when its record type is gone (Review shows
 * it without a type), and replaces the suggestions nobody reviewed.
 */
export function recordsImpact(
  records: readonly ExtractionRecord[],
  recordTypeIds: ReadonlySet<string>,
): string | null {
  if (records.length === 0) return null;
  const touched = records.filter(isTouchedByPerson);
  const orphaned = touched.filter((r) => !recordTypeIds.has(r.recordTypeId)).length;
  const sentences: string[] = [];
  if (orphaned > 0) {
    sentences.push(
      `${plural(orphaned, "record")} you reviewed or added ${orphaned === 1 ? "belongs" : "belong"} to a record type this template doesn't have. ${orphaned === 1 ? "It stays" : "They stay"} at the next run, as ${orphaned === 1 ? "a record" : "records"} without a record type.`,
    );
  } else if (touched.length > 0) {
    sentences.push("The records you reviewed or added stay at the next run.");
  }
  if (records.length > touched.length) {
    sentences.push("The next run replaces the suggestions nobody has reviewed.");
  }
  return sentences.join(" ");
}
