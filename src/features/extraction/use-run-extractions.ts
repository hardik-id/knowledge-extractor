"use client";

import { useMemo } from "react";
import { isApiError } from "@/lib/api/api-error";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { FileExtraction } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";

/**
 * The extraction of every file of the run that was extracted, one entry per
 * file. Only a file an extraction ran on has one to ask for; the ETag of its
 * output says when it changed, so a new extraction is fetched again.
 */
export function useRunExtractions(): { extractions: FileExtraction[] | undefined; error: unknown } {
  const runId = usePipelineStore((s) => s.runId);
  const runFiles = usePipelineStore((s) => s.runFiles);
  const cells = usePipelineStore((s) => s.cells);
  const extracted = useMemo(
    () =>
      runFiles
        .filter((f) => cells[f.id]?.extract?.output)
        .map((f) => ({ id: f.id, etag: cells[f.id]?.extract?.output?.etag ?? "" })),
    [runFiles, cells],
  );
  const key = runId ? JSON.stringify([runId, extracted.map((f) => [f.id, f.etag])]) : null;
  const { data, error } = useAsyncData(key, async (signal) => {
    const all = await Promise.all(
      extracted.map(async ({ id: fileId }) => {
        try {
          return await services.extraction.getFileExtraction(runId!, fileId, signal);
        } catch (e) {
          if (isApiError(e) && e.code === "extraction_not_found") return null;
          throw e;
        }
      }),
    );
    return all.filter((x): x is FileExtraction => x !== null);
  });
  return { extractions: data, error };
}
