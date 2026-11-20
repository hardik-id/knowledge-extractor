"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "@/lib/use-async-data";
import { isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import type { DefinitionTemplate, ExtractionDefinition } from "@/services/contracts";
import { toastFailure } from "@/features/auth/report-failure";
import { MAX_DEFINITION_NOTE_LENGTH } from "@/services/contracts";
import type { ExtractionNoun } from "@/services/errors";
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
  /** Saves the draft as a new version, with an optional note. Resolves to it, or null if it was not saved. */
  save: (note?: string) => Promise<ExtractionDefinition | null>;
  /** Makes an older version the newest one and loads it as the draft. Resolves to it, or null. */
  restore: (version: number) => Promise<ExtractionDefinition | null>;
  discard: () => void;
  /** Replaces the draft with the template's configuration. It stays unsaved until saved or discarded. */
  applyTemplate: (template: DefinitionTemplate) => void;
  /** The note a save starts with after a template was loaded ("From template: <name>"), until it is saved or discarded. */
  suggestedNote: string;
}

/** The note a template's save starts with. */
export function templateNote(name: string): string {
  return `From template: ${name}`.slice(0, MAX_DEFINITION_NOTE_LENGTH);
}

const NO_ERRORS: DraftErrors = { types: {}, fields: {}, general: [] };

/** The run's extraction definition: the saved version and the person's unsaved edits. */
export function useExtractionDefinition(
  noun: ExtractionNoun = "definition",
): ExtractionDefinitionState {
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
    suggestedNote: string;
  } | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Take a freshly loaded definition (new run, or a reload after a conflict).
  let state = local;
  if (data && (!local || local.runId !== runId || local.loaded !== data)) {
    state = { runId, loaded: data, saved: data, draft: toDraft(data), suggestedNote: "" };
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

  const reportFailure = (e: unknown, title: string) => {
    if (isApiError(e) && e.code === "definition_conflict") {
      toast.error(`The ${noun} changed elsewhere`, {
        description: "We loaded the latest version. Make your changes again.",
      });
      retry();
    } else {
      toastFailure(title, e, noun);
    }
  };

  const save = async (note?: string): Promise<ExtractionDefinition | null> => {
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
        (note ?? current.suggestedNote).trim() || undefined,
      );
      setLocal((prev) =>
        prev ? { ...prev, saved: result, draft: toDraft(result), suggestedNote: "" } : prev,
      );
      return result;
    } catch (e) {
      reportFailure(e, `Couldn't save the ${noun}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const restore = async (version: number): Promise<ExtractionDefinition | null> => {
    if (!runId || !current) return null;
    setSaving(true);
    try {
      const result = await services.extraction.restoreDefinitionVersion(runId, version);
      setLocal((prev) =>
        prev ? { ...prev, saved: result, draft: toDraft(result), suggestedNote: "" } : prev,
      );
      setShowErrors(false);
      return result;
    } catch (e) {
      reportFailure(e, `Couldn't restore that version`);
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
    restore,
    suggestedNote: current?.suggestedNote ?? "",
    applyTemplate: (template) => {
      setLocal((prev) =>
        prev
          ? {
              ...prev,
              draft: structuredClone(template.definition),
              suggestedNote: templateNote(template.name),
            }
          : prev,
      );
      setShowErrors(false);
    },
    discard: () => {
      setLocal((prev) =>
        prev ? { ...prev, draft: toDraft(prev.saved), suggestedNote: "" } : prev,
      );
      setShowErrors(false);
    },
  };
}
