"use client";

import { useMemo } from "react";
import { appProfile } from "@/config/app-profile";
import type { AsyncData } from "@/lib/use-async-data";
import { usePipelineStore } from "@/store/pipeline-store";
import type { PipelineState } from "@/store/types";
import { useStageOutput } from "./use-stage-output";

/** The text extraction works on for one file, with its content type and version. */
export interface ExtractionInput {
  text: string;
  contentType: string;
  etag: string;
}

/** Shown when the app's profile names an input kind this code does not know. */
function unknownKind(kind: never): never {
  throw new Error(`Unknown extraction input: ${String(kind)}`);
}

/** Whether the file has the text extraction works on (pipeline: an enrich output). Plain function over store state, usable in selectors. */
export function hasExtractionInput(state: Pick<PipelineState, "cells">, fileId: string): boolean {
  return extractionInputEtag(state, fileId) !== null;
}

/** The input's current version, or null when there is none yet. */
export function extractionInputEtag(
  state: Pick<PipelineState, "cells">,
  fileId: string,
): string | null {
  const kind = appProfile.extractionInput;
  switch (kind) {
    case "enrich":
      return state.cells[fileId]?.enrich?.output?.etag ?? null;
    default:
      return unknownKind(kind);
  }
}

/** Loads the text extraction works on for a file. Pass `null` when no file is chosen. */
export function useExtractionInput(fileId: string | null): AsyncData<ExtractionInput> {
  const kind = appProfile.extractionInput;
  switch (kind) {
    case "enrich":
      // The profile never changes at runtime, so the same hook runs every render.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useEnrichInput(fileId);
    default:
      return unknownKind(kind);
  }
}

function useEnrichInput(fileId: string | null): AsyncData<ExtractionInput> {
  const output = useStageOutput(fileId, "enrich");
  const etag = usePipelineStore((s) => (fileId ? extractionInputEtag(s, fileId) : null));
  const { data: content } = output;
  const data = useMemo(
    () =>
      content && etag ? { text: content.text, contentType: content.contentType, etag } : undefined,
    [content, etag],
  );
  return { ...output, data };
}
