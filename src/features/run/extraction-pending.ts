import type { PipelineState } from "@/store/types";

/**
 * Whether a file's records are better waited for than fetched: its extraction
 * is queued or running, and nothing in this session has told us it has records
 * (no "records changed" message, no change of ours). Fetching then would most
 * likely be answered 404 `extraction_not_found`, which the browser logs as an
 * error, and the records change when the cell finishes anyway.
 */
export function awaitsExtraction(
  state: Pick<PipelineState, "cells" | "extractionRevisions">,
  fileId: string,
): boolean {
  const status = state.cells[fileId]?.extract?.status;
  return (
    (status === "queued" || status === "running") && state.extractionRevisions[fileId] === undefined
  );
}
