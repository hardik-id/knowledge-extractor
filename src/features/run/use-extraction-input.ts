"use client";

import { useMemo } from "react";
import { BoundedCache, useAsyncData, type AsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { DocumentContent } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";
import type { PipelineState } from "@/store/types";
import { extractionInputKind } from "./extraction-input-kind";
import { useStageOutput } from "./use-stage-output";

/** The text extraction works on for one file, with its content type and version. */
export interface ExtractionInput {
  text: string;
  contentType: string;
  etag: string;
}

/** Documents already fetched. The key contains the ETag, so an entry never goes out of date. */
const documents = new BoundedCache<DocumentContent>(30);

/** Whether the file has the text extraction works on (pipeline: an enrich output; documents: the document). Plain function over store state, usable in selectors. */
export function hasExtractionInput(
  state: Pick<PipelineState, "cells" | "runFiles">,
  fileId: string,
): boolean {
  return extractionInputEtag(state, fileId) !== null;
}

/** The input's current version, or null when there is none yet. */
export function extractionInputEtag(
  state: Pick<PipelineState, "cells" | "runFiles">,
  fileId: string,
): string | null {
  const file = state.runFiles.find((f) => f.id === fileId);
  if (!file) return null;
  return extractionInputKind(file) === "document"
    ? (file.etag ?? null)
    : (state.cells[fileId]?.enrich?.output?.etag ?? null);
}

/** Loads the text extraction works on for a file. Pass `null` when no file is chosen. */
export function useExtractionInput(fileId: string | null): AsyncData<ExtractionInput> {
  const kind = usePipelineStore((s) => {
    const file = fileId ? s.runFiles.find((f) => f.id === fileId) : undefined;
    return file ? extractionInputKind(file) : null;
  });
  // Both loaders always run, so the hooks are the same on every render. The one
  // that is not needed gets no file and stays idle.
  const enrich = useEnrichInput(kind === "enrich" ? fileId : null);
  const document = useDocumentInput(kind === "document" ? fileId : null);
  return kind === "document" ? document : enrich;
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

/** The document as it is in storage. The fetched content's ETag is the input's version. */
function useDocumentInput(fileId: string | null): AsyncData<ExtractionInput> {
  const sourceRef = usePipelineStore((s) =>
    fileId ? (s.runFiles.find((f) => f.id === fileId)?.sourceRef ?? null) : null,
  );
  const listedEtag = usePipelineStore((s) => (fileId ? extractionInputEtag(s, fileId) : null));

  const documentId = sourceRef;
  const result = useAsyncData(
    documentId ? JSON.stringify([documentId, listedEtag]) : null,
    (signal) =>
      documentId
        ? services.documents.get(documentId, signal)
        : Promise.reject(new Error("No document to load.")),
    documents,
  );
  const { data: content } = result;
  const data = useMemo(
    () =>
      content
        ? { text: content.text, contentType: content.contentType, etag: content.etag }
        : undefined,
    [content],
  );
  return { ...result, data };
}
