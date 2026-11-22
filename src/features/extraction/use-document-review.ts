"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtractionActions, useFileExtraction } from "@/features/run/use-extraction";
import { extractionInputEtag, useExtractionInput } from "@/features/run/use-extraction-input";
import { readSelection } from "@/lib/dom-selection";
import { spanFromRange } from "@/lib/text-spans";
import type { ExtractionDefinition, FieldDef, RecordType, TextSpan } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";
import { fieldLabels } from "./labels";
import { buildReviewMarks } from "./review-marks";
import { placeMenu, valuesWithNew, type Place } from "./review-selection";
import { SELECTION_MENU_WIDTH } from "./selection-menu";

/** A finished text selection in the document, and where its menu goes. */
export interface PendingSelection {
  start: number;
  end: number;
  place: Place;
  /** Made with the keyboard. */
  keyboard: boolean;
}

interface DocumentReviewOptions {
  fileId: string | null;
  definition: Pick<ExtractionDefinition, "recordTypes">;
  /** The record that values are added to from a selection. */
  activeRecordId: string | null;
  /** A record was made from a selection: make it the active one. */
  onRecordCreated: (recordId: string) => void;
}

/**
 * One open document and its extraction: the text, the records, the marks to
 * paint, and turning a text selection into a value or a record. The caller
 * puts `frameRef` on the box the selection menu is placed in, `documentRef` on
 * the text, and calls `capture` when a pointer or Shift is released.
 */
export function useDocumentReview({
  fileId,
  definition,
  activeRecordId,
  onRecordCreated,
}: DocumentReviewOptions) {
  const text = useExtractionInput(fileId);
  const extraction = useFileExtraction(fileId);
  const listedEtag = usePipelineStore((s) => (fileId ? extractionInputEtag(s, fileId) : null));
  // The loaded text is the truth; until it arrives, the version the store knows.
  const inputEtag = text.data?.etag ?? listedEtag;

  const [selection, setSelection] = useState<PendingSelection | null>(null);
  // A value just added from a selection, to be made active once it is in the records.
  const [added, setAdded] = useState<{ recordId: string; fieldId: string; span: TextSpan } | null>(
    null,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef(false);

  const actions = useExtractionActions(extraction.data);

  const { recordTypes } = definition;
  const labels = useMemo(() => fieldLabels({ recordTypes }), [recordTypes]);
  const sourceText = text.data?.text;
  const records = extraction.data?.records;
  const review = useMemo(
    () =>
      sourceText !== undefined && records
        ? buildReviewMarks(sourceText, labels, { records })
        : null,
    [sourceText, labels, records],
  );

  const failure = text.error ?? extraction.error;
  const loading = !text.data || !extraction.data || !review;
  const retry = () => {
    if (text.error) text.retry();
    if (extraction.error) extraction.retry();
  };

  const outdated =
    extraction.data !== undefined && inputEtag !== null && extraction.data.sourceEtag !== inputEtag;

  const addedValue = added
    ? records
        ?.find((r) => r.id === added.recordId)
        ?.fields.find(
          (v) =>
            v.fieldId === added.fieldId &&
            v.spans[0]?.start === added.span.start &&
            v.spans[0]?.quote === added.span.quote,
        )
    : undefined;

  // Selecting text: read it when the pointer or Shift is released, or (on touch) when it settles.
  const capture = useCallback(
    (keyboard: boolean) => {
      const root = documentRef.current;
      const frame = frameRef.current;
      if (!root || !frame || sourceText === undefined) return;
      const read = readSelection(root, sourceText);
      if (!read) {
        setSelection(null);
        return;
      }
      const box = frame.getBoundingClientRect();
      setSelection({
        start: read.range.start,
        end: read.range.end,
        keyboard,
        place: placeMenu({
          anchor: { x: read.rect.right - box.left, bottom: read.rect.bottom - box.top },
          boxWidth: frame.clientWidth,
          menuWidth: SELECTION_MENU_WIDTH,
        }),
      });
    },
    [sourceText],
  );
  const closeMenu = useCallback(() => setSelection(null), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      if (document.getSelection()?.isCollapsed) {
        setSelection(null);
      } else if (touchRef.current) {
        timer = setTimeout(() => capture(false), 400);
      }
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [capture]);

  const activeRecord = records?.find((r) => r.id === activeRecordId);
  const activeType = activeRecord
    ? definition.recordTypes.find((t) => t.id === activeRecord.recordTypeId)
    : undefined;

  const finishSelection = () => {
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  };
  const addToField = async (field: FieldDef) => {
    if (!selection || !activeRecord || sourceText === undefined) return;
    const span = spanFromRange(sourceText, selection.start, selection.end);
    const saved = await actions.setFieldValues(
      activeRecord.id,
      field.id,
      valuesWithNew(activeRecord, field, { value: span.quote, span }),
    );
    if (!saved) return;
    setAdded({ recordId: activeRecord.id, fieldId: field.id, span });
    finishSelection();
  };
  const newRecord = async (type: RecordType) => {
    if (!selection || sourceText === undefined) return;
    const span = spanFromRange(sourceText, selection.start, selection.end);
    const id = await actions.addRecord({ recordTypeId: type.id, span, fields: [] });
    if (!id) return;
    setAdded(null);
    onRecordCreated(id);
    finishSelection();
  };

  return {
    text,
    extraction,
    sourceText,
    records,
    labels,
    review,
    failure,
    loading,
    retry,
    outdated,
    actions,
    frameRef,
    documentRef,
    touchRef,
    selection,
    capture,
    closeMenu,
    activeRecord,
    activeType,
    added,
    setAdded,
    addedValue,
    addToField,
    newRecord,
  };
}
