"use client";

import { useMemo, useState } from "react";
import { isApiError } from "@/lib/api/api-error";
import { BoundedCache, useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { FileExtraction } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";

/**
 * The extraction of every file of the run that was extracted, one entry per
 * file. Only a file an extraction ran on has one to ask for; the ETag of its
 * output says when it changed, so a new extraction is fetched again.
 *
 * `followEdits` fetches a file again when a person's change raises its revision, not only when a
 * run changes its output. The default keeps the fetch to runs.
 */
export function useRunExtractions(options?: { followEdits?: boolean }): {
  extractions: FileExtraction[] | undefined;
  error: unknown;
  /** True while `extractions` is still for an earlier set of files, runs or revisions. */
  isLoading: boolean;
} {
  const revisions = usePipelineStore((s) => s.extractionRevisions);
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
  // Extractions already fetched, by file, etag and revision: a change to one file fetches only it.
  const [fetched] = useState(() => new BoundedCache<FileExtraction>(500));
  const key = runId
    ? JSON.stringify([
        runId,
        extracted.map((f) => [f.id, f.etag, ...(options?.followEdits ? [revisions[f.id]] : [])]),
      ])
    : null;
  const { data, error, isLoading } = useAsyncData(key, async (signal) => {
    const all = await Promise.all(
      extracted.map(async ({ id: fileId, etag }) => {
        const entry = JSON.stringify([
          runId,
          fileId,
          etag,
          ...(options?.followEdits ? [revisions[fileId]] : []),
        ]);
        const known = fetched.get(entry);
        if (known) return known;
        try {
          const got = await services.extraction.getFileExtraction(runId!, fileId, signal);
          fetched.set(entry, got);
          return got;
        } catch (e) {
          if (isApiError(e) && e.code === "extraction_not_found") return null;
          throw e;
        }
      }),
    );
    return all.filter((x): x is FileExtraction => x !== null);
  });
  return { extractions: data, error, isLoading };
}
