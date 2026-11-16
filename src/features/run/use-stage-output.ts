"use client";

import { BoundedCache, useAsyncData, type AsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import {
  sharedOutputStages,
  type StageOutputContent,
  type WorkStageId,
} from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";

/** Outputs already fetched. The key contains the ETags, so an entry never goes out of date. */
const outputs = new BoundedCache<StageOutputContent>(30);

/**
 * The text of one file's output for a stage (Markdown, JSON), fetched when it
 * is first shown. Running the stage again changes the ETag, which fetches the
 * new text. Classify and enrich share one stored file, so the key holds the
 * ETags of both: finishing enrichment refetches the classification view too.
 * The fetch waits for the stage's own output. Pass `null` when no file is chosen.
 */
export function useStageOutput(
  fileId: string | null,
  stage: WorkStageId,
): AsyncData<StageOutputContent> {
  const runId = usePipelineStore((s) => s.runId);
  const etag = usePipelineStore((s) =>
    fileId ? (s.cells[fileId]?.[stage]?.output?.etag ?? null) : null,
  );
  // One string, so the selector's result is stable between renders.
  const writerEtags = usePipelineStore((s) =>
    fileId
      ? JSON.stringify(
          sharedOutputStages(stage).map((id) => s.cells[fileId]?.[id]?.output?.etag ?? null),
        )
      : "",
  );

  const target = runId && fileId && etag ? { runId, fileId, writerEtags } : null;

  return useAsyncData(
    target ? JSON.stringify([target.runId, target.fileId, stage, target.writerEtags]) : null,
    (signal) =>
      target
        ? services.runs.getOutput(target.runId, target.fileId, stage, signal)
        : Promise.reject(new Error("No output to load.")),
    outputs,
  );
}
