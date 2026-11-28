"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useFileExtraction } from "@/features/run/use-extraction";
import { overlayIsOpen, scrollTargetValueId } from "./field-selection-rules";
import { useScreen } from "./screen-state";

/** Which field is selected in the table, and where the document should scroll for it. */
export interface FieldSelection {
  selectedFieldId: string | null;
  /** The value to scroll the document to; changes when the selection or the record does. */
  scrollTargetValueId: string | null;
  /** A click on a field's row (its id) selects it, a second click clears it; Esc passes null. */
  toggle: (fieldId: string | null) => void;
  clear: () => void;
}

/**
 * The field selection of the working screen. The selection itself lives in the screen state,
 * which already clears it when the record type changes or the field leaves the draft. Esc clears
 * it from anywhere, unless a menu or dialog is open (it closes first) or something already
 * handled the key.
 */
export function useFieldSelection(): FieldSelection {
  const { fileId, selectedFieldId, selectedTypeId, currentRecordId, setSelectedFieldId } =
    useScreen();
  const records = useFileExtraction(fileId).data?.records;

  const toggle = useCallback(
    (fieldId: string | null) =>
      setSelectedFieldId(fieldId === null || fieldId === selectedFieldId ? null : fieldId),
    [selectedFieldId, setSelectedFieldId],
  );
  const clear = useCallback(() => setSelectedFieldId(null), [setSelectedFieldId]);

  useEffect(() => {
    if (!selectedFieldId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (overlayIsOpen(document)) return;
      clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedFieldId, clear]);

  const target = useMemo(
    () => scrollTargetValueId(records, selectedTypeId, currentRecordId, selectedFieldId),
    [records, selectedTypeId, currentRecordId, selectedFieldId],
  );

  return { selectedFieldId, scrollTargetValueId: target, toggle, clear };
}
