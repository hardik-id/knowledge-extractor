"use client";

import { BoundedCache, useAsyncData, type AsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { StageOutputContent, WorkStageId } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";

/** Outputs already fetched. The key contains the ETag, so an entry never goes out of date. */
const outputs = new BoundedCache<StageOutputContent>(30);

/**
 * The text of one file's output for a stage (Markdown, JSON), fetched when it
 * is first shown. Running the stage again changes the ETag, which fetches the
 * new text. Pass `null` when no file is chosen.
 */
export function useStageOutput(
  fileId: string | null,
  stage: WorkStageId,
): AsyncData<StageOutputContent> {
  const runId = usePipelineStore((s) => s.runId);
  const etag = usePipelineStore((s) =>
    fileId ? (s.cells[fileId]?.[stage]?.output?.etag ?? null) : null,
  );

  const target = runId && fileId && etag ? { runId, fileId, etag } : null;

  return useAsyncData(
    target ? JSON.stringify([target.runId, target.fileId, stage, target.etag]) : null,
    (signal) =>
      target
        ? services.runs.getOutput(target.runId, target.fileId, stage, signal)
        : Promise.reject(new Error("No output to load.")),
    outputs,
  );
}
