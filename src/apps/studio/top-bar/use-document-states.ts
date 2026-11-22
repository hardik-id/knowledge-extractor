"use client";

import { useMemo } from "react";
import { useRunExtractions } from "@/features/extraction/use-run-extractions";
import { usePipelineStore } from "@/store/pipeline-store";
import { documentState, type DocumentState } from "./document-states";

/**
 * The state of each document of the run, by file id. A document whose extraction is still being
 * fetched has no entry yet. It follows a person's review as well as a run.
 */
export function useDocumentStates(): Record<string, DocumentState> {
  const runFiles = usePipelineStore((s) => s.runFiles);
  const cells = usePipelineStore((s) => s.cells);
  const { extractions } = useRunExtractions({ followEdits: true });
  return useMemo(() => {
    const byFile = new Map(extractions?.map((e) => [e.fileId, e]));
    const states: Record<string, DocumentState> = {};
    for (const file of runFiles) {
      const state = documentState(cells[file.id]?.extract, byFile.get(file.id));
      if (state) states[file.id] = state;
    }
    return states;
  }, [runFiles, cells, extractions]);
}
