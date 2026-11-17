/** Pipeline stages, in run order. The single list every other module reads. */
export const STAGE_IDS = [
  "select",
  "ingest",
  "transform",
  "classify",
  "enrich",
  "extract",
  "index",
] as const;

export type StageId = (typeof STAGE_IDS)[number];

/**
 * Work status of one stage in the current run.
 * - idle:    nothing started
 * - running: work in progress
 * - ready:   work finished, the person can proceed
 * - done:    the person proceeded past this stage
 * - error:   work failed
 */
export type StageRunStatus = "idle" | "running" | "ready" | "done" | "error";

/** What the sidebar shows: run status plus whether the stage can be opened yet. */
export type StageAccess = "locked" | "current" | "available" | "done";

/** `storage`: documents already enriched, read from a storage container (Knowledge Studio). */
export type SourceKind = "confluence" | "sharepoint" | "upload" | "storage";

export type FileType = "pdf" | "docx" | "xlsx" | "pptx" | "html" | "md" | "txt";

export interface SourceFile {
  id: string;
  name: string;
  source: SourceKind;
  type: FileType;
  sizeBytes: number;
  /** Space / site path shown under the name, e.g. "HR / Policies" */
  location: string;
  modifiedAt: string; // ISO-8601
  /** The file's version in its source, when the source reports one (storage documents do). */
  etag?: string;
}
