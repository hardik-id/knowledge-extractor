"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "@/lib/use-async-data";
import { isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import type { ExtractionDefinition } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import {
  isDirty,
  isValid,
  toDraft,
  validateDraft,
  type Draft,
  type DraftErrors,
} from "./definition-draft";

export interface ExtractionDefinitionState {
  isLoading: boolean;
  error: unknown;
  retry: () => void;
  /** The last saved version. Undefined until loaded. */
  saved: ExtractionDefinition | undefined;
  draft: Draft | undefined;
  setDraft: (next: Draft | ((current: Draft) => Draft)) => void;
  dirty: boolean;
  errors: DraftErrors;
  valid: boolean;
  /** True once the person tried to run or save with problems: show them. */
  showErrors: boolean;
  revealErrors: () => void;
  saving: boolean;
  /** Saves the draft. Resolves to the saved definition, or null if it was not saved. */
  save: () => Promise<ExtractionDefinition | null>;
  discard: () => void;
}

const NO_ERRORS: DraftErrors = { types: {}, fields: {}, general: [] };

/** The run's extraction definition: the saved version and the person's unsaved edits. */
export function useExtractionDefinition(): ExtractionDefinitionState {
  const runId = usePipelineStore((s) => s.runId);
  const { data, error, isLoading, retry } = useAsyncData(runId, (signal) =>
    runId ? services.extraction.getDefinition(runId, signal) : Promise.reject(new Error("No run.")),
  );

  // Edits and saves are kept next to the load they belong to (the run id).
  const [local, setLocal] = useState<{
    runId: string | null;
    loaded: ExtractionDefinition | undefined;
    saved: ExtractionDefinition;
    draft: Draft;
  } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Take a freshly loaded definition (new run, or a reload after a conflict).
  let state = local;
  if (data && (!local || local.runId !== runId || local.loaded !== data)) {
    state = { runId, loaded: data, saved: data, draft: toDraft(data) };
    setLocal(state);
    setShowErrors(false);
  }
  const current = state && state.runId === runId ? state : null;

  const saved = current?.saved;
  const draft = current?.draft;
  const errors = draft ? validateDraft(draft) : NO_ERRORS;
  const valid = isValid(errors);

  const setDraft: ExtractionDefinitionState["setDraft"] = (next) =>
    setLocal((prev) =>
      prev ? { ...prev, draft: typeof next === "function" ? next(prev.draft) : next } : prev,
    );

  const save = async (): Promise<ExtractionDefinition | null> => {
    if (!runId || !current) return null;
    if (!valid) {
      setShowErrors(true);
      return null;
    }
    if (!isDirty(current.draft, current.saved)) return current.saved;
    setSaving(true);
    try {
      const result = await services.extraction.saveDefinition(
        runId,
        current.draft,
        current.saved.version,
      );
      setLocal((prev) => (prev ? { ...prev, saved: result, draft: toDraft(result) } : prev));
      return result;
    } catch (e) {
      if (isApiError(e) && e.code === "definition_conflict") {
        toast.error("The definition changed elsewhere", {
          description: "We loaded the latest version. Make your changes again.",
        });
        retry();
      } else {
        toast.error("Couldn't save the definition", { description: describeApiError(e) });
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    isLoading: isLoading || (!!data && !current),
    error,
    retry,
    saved,
    draft,
    setDraft,
    dirty: !!draft && !!saved && isDirty(draft, saved),
    errors,
    valid,
    showErrors,
    revealErrors: () => setShowErrors(true),
    saving,
    save,
    discard: () => {
      setLocal((prev) => (prev ? { ...prev, draft: toDraft(prev.saved) } : prev));
      setShowErrors(false);
    },
  };
}
