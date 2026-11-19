import { isApiError } from "@/lib/api/api-error";
import type { FileExtraction, RunFile } from "@/services/contracts";
import type { SourceFile } from "@/types/pipeline";

/** What the person is told when the backend refuses a change during a run. */
export const WAIT_FOR_RUN = "Wait for the run to finish";

/** Whether a person has accepted, rejected, added or edited anything in these records. */
export function hasReviewedRecords(extraction: FileExtraction): boolean {
  return extraction.records.some(
    (record) =>
      record.origin === "human" ||
      record.review !== "suggested" ||
      record.fields.some((value) => value.origin === "human" || value.review !== "suggested"),
  );
}

/** The run's files that a new selection leaves out. */
export function removedFiles(
  runFiles: readonly RunFile[],
  selection: readonly SourceFile[],
): RunFile[] {
  const wanted = new Set(selection.map((file) => file.id));
  return runFiles.filter((file) => !wanted.has(file.sourceRef));
}

/** The backend refuses to change the documents while an extraction is queued or running. */
export const isRunBusy = (error: unknown): boolean =>
  isApiError(error) && error.status === 409 && error.code === "execution_in_progress";

/**
 * The files among `removed` whose records a person worked on, so dropping them
 * loses something. A file that was never extracted, or whose records nobody
 * touched, is not one.
 */
export async function removedWithReviewedRecords(
  removed: readonly RunFile[],
  load: (file: RunFile) => Promise<FileExtraction | null>,
): Promise<RunFile[]> {
  const loaded = await Promise.all(removed.map(async (file) => [file, await load(file)] as const));
  return loaded.flatMap(([file, extraction]) =>
    extraction && hasReviewedRecords(extraction) ? [file] : [],
  );
}
