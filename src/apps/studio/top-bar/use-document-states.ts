"use client";

import { useMemo } from "react";
import { useRunExtractions } from "@/features/extraction/use-run-extractions";
import { usePipelineStore } from "@/store/pipeline-store";
import { documentState, type DocumentState } from "./document-states";

/**
 * The state of each document of the run, by file id. A document whose extraction is still being
 * fetched has no entry while it loads. It follows a person's review as well as a run.
 */
export function useDocumentStates(): Record<string, DocumentState> {
  const runFiles = usePipelineStore((s) => s.runFiles);
  const cells = usePipelineStore((s) => s.cells);
  const { extractions, isLoading } = useRunExtractions({ followEdits: true });
  return useMemo(() => {
    // While loading, `extractions` can belong to an earlier key: its counts would be stale.
    const byFile = new Map((isLoading ? [] : extractions)?.map((e) => [e.fileId, e]));
    const states: Record<string, DocumentState> = {};
    for (const file of runFiles) {
      const state = documentState(cells[file.id]?.extract, byFile.get(file.id));
      if (state) states[file.id] = state;
      else if (!isLoading) states[file.id] = { kind: "unavailable", label: "Not available" };
    }
    return states;
  }, [runFiles, cells, extractions, isLoading]);
}
