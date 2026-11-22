import type { FileExtraction, StageCell } from "@/services/contracts";

export type DocumentStateKind =
  "not-run" | "running" | "failed" | "to-review" | "reviewed" | "nothing-found" | "unavailable";

export interface DocumentState {
  kind: DocumentStateKind;
  label: string;
}

/**
 * What the switcher says about one document: its extract cell and, once there is one, its
 * extraction. A file whose extraction is not known yet (still loading) counts as "Not run yet"
 * only when its cell has no output; otherwise the state waits and is `null`.
 */
export function documentState(
  cell: StageCell | undefined,
  extraction: FileExtraction | undefined,
): DocumentState | null {
  const status = cell?.status;
  if (status === "queued" || status === "running") return { kind: "running", label: "Running…" };
  if (status === "failed") return { kind: "failed", label: "Run failed" };
  if (!cell?.output) return { kind: "not-run", label: "Not run yet" };
  if (!extraction) return null;

  const records = extraction.records;
  if (records.length === 0) return { kind: "nothing-found", label: "Nothing found" };
  const open = records.filter((r) => r.review === "suggested").length;
  if (open > 0) return { kind: "to-review", label: `${open} to review` };
  return {
    kind: "reviewed",
    label: `${records.length} ${records.length === 1 ? "record" : "records"} reviewed`,
  };
}
