"use client";

import { useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/api-error";
import { BoundedCache, useAsyncData, type AsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type {
  FieldValueInput,
  FileExtraction,
  NewRecordInput,
  RecordPatch,
  ReviewState,
} from "@/services/contracts";
import { toastFailure } from "@/features/auth/report-failure";
import { usePipelineStore, useRunStoreApi } from "@/store/pipeline-store";
import { awaitsExtraction } from "./extraction-pending";
import { extractionInputEtag } from "./use-extraction-input";

/**
 * Records already fetched. A key holds the revision, so an entry never goes
 * out of date; the answer to a change is stored under its new revision, which
 * saves fetching it again.
 */
const extractions = new BoundedCache<FileExtraction>(50);

const keyFor = (runId: string, fileId: string, sourceEtag: string, revision: number) =>
  JSON.stringify([runId, fileId, sourceEtag, revision]);

/**
 * The records extracted from one file, or marked in it by hand. Fetched again
 * when the server says they changed (the file's revision goes up) and when an
 * extraction run finishes. A file nothing was extracted from yet gives an
 * empty list at revision 0, so it can be labelled from scratch. Nothing is
 * loaded until the file has the text extraction works on (see `use-extraction-input.ts`),
 * nor while its first known extraction is on its way (`awaitsExtraction`).
 * Pass `null` when no file is chosen.
 */
export function useFileExtraction(fileId: string | null): AsyncData<FileExtraction> {
  const runId = usePipelineStore((s) => s.runId);
  const sourceEtag = usePipelineStore((s) => (fileId ? extractionInputEtag(s, fileId) : null));
  // A finished run changes this ETag, in case the "records changed" message was missed.
  const runEtag = usePipelineStore((s) =>
    fileId ? (s.cells[fileId]?.extract?.output?.etag ?? "") : "",
  );
  const revision = usePipelineStore((s) => (fileId ? (s.extractionRevisions[fileId] ?? 0) : 0));
  const waiting = usePipelineStore((s) => (fileId ? awaitsExtraction(s, fileId) : false));

  const target = runId && fileId && sourceEtag && !waiting ? { runId, fileId, sourceEtag } : null;

  return useAsyncData(
    target
      ? keyFor(target.runId, target.fileId, `${target.sourceEtag}|${runEtag}`, revision)
      : null,
    async (signal) => {
      if (!target) throw new Error("No extraction to load.");
      try {
        return await services.extraction.getFileExtraction(target.runId, target.fileId, signal);
      } catch (error) {
        if (!(isApiError(error) && error.code === "extraction_not_found")) throw error;
        return {
          fileId: target.fileId,
          revision: 0,
          sourceEtag: target.sourceEtag,
          definitionVersion: 0,
          records: [],
        };
      }
    },
    extractions,
  );
}

export interface ExtractionActions {
  /** A change is on its way to the server. */
  pending: boolean;
  /** Resolves with the id of the new record, or null if it failed. */
  addRecord: (input: NewRecordInput) => Promise<string | null>;
  updateRecord: (recordId: string, patch: RecordPatch) => Promise<boolean>;
  deleteRecord: (recordId: string) => Promise<boolean>;
  setFieldValues: (
    recordId: string,
    fieldId: string,
    values: FieldValueInput[],
  ) => Promise<boolean>;
  setValueReview: (recordId: string, valueId: string, review: ReviewState) => Promise<boolean>;
}

/**
 * The changes a person can make to a file's records. Each one is sent with the
 * revision on screen; the server's answer becomes the new state. A failure is
 * shown as a toast, and after a conflict the records are fetched again.
 * `extraction` is what `useFileExtraction` returned for the same file.
 */
export function useExtractionActions(extraction: FileExtraction | undefined): ExtractionActions {
  const runStore = useRunStoreApi();
  const [pending, setPending] = useState(0);

  const send = async (
    change: (runId: string, current: FileExtraction) => Promise<FileExtraction>,
  ): Promise<FileExtraction | null> => {
    const store = runStore.getState();
    const runId = store.runId;
    if (!runId || !extraction) return null;
    const { fileId } = extraction;
    const inputEtag = extractionInputEtag(store, fileId);
    const runEtag = store.cells[fileId]?.extract?.output?.etag;

    setPending((n) => n + 1);
    try {
      const next = await change(runId, extraction);
      extractions.set(
        keyFor(runId, fileId, `${inputEtag ?? ""}|${runEtag ?? ""}`, next.revision),
        next,
      );
      runStore.getState().setExtractionRevision(fileId, next.revision);
      return next;
    } catch (error) {
      if (isApiError(error) && error.code === "revision_conflict") {
        toast.error("These records changed in the meantime", {
          description: "The latest version is loaded. Make your change again.",
        });
        // The cached answers are older than the server: start from a fresh fetch.
        for (const key of [...extractions.keys()]) {
          if (key.startsWith(JSON.stringify([runId, fileId]).slice(0, -1))) extractions.delete(key);
        }
        runStore.getState().setExtractionRevision(fileId, extraction.revision + 1);
      } else {
        toastFailure("Couldn't save the change", error);
      }
      return null;
    } finally {
      setPending((n) => n - 1);
    }
  };

  const api = services.extraction;
  return {
    pending: pending > 0,
    addRecord: async (input) => {
      const before = new Set(extraction?.records.map((record) => record.id));
      const next = await send((runId, e) => api.addRecord(runId, e.fileId, input, e.revision));
      return next?.records.find((record) => !before.has(record.id))?.id ?? null;
    },
    updateRecord: async (recordId, patch) =>
      (await send((runId, e) => api.updateRecord(runId, e.fileId, recordId, patch, e.revision))) !==
      null,
    deleteRecord: async (recordId) =>
      (await send((runId, e) => api.deleteRecord(runId, e.fileId, recordId, e.revision))) !== null,
    setFieldValues: async (recordId, fieldId, values) =>
      (await send((runId, e) =>
        api.setFieldValues(runId, e.fileId, recordId, fieldId, values, e.revision),
      )) !== null,
    setValueReview: async (recordId, valueId, review) =>
      (await send((runId, e) =>
        api.setValueReview(runId, e.fileId, recordId, valueId, review, e.revision),
      )) !== null,
  };
}
