"use client";

import { History } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnnotatedMarkdown } from "@/components/pipeline/annotated-markdown";
import type { HighlightData } from "@/components/pipeline/annotated-text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findHighlight, scrollToElement } from "@/features/extraction/review-scroll";
import { recordHeading } from "@/features/extraction/review-selection";
import { SelectionMenu } from "@/features/extraction/selection-menu";
import { useDocumentReview } from "@/features/extraction/use-document-review";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { describeApiError } from "@/services/errors";
import { useFieldSelection } from "./use-field-selection";
import { ValueMenu } from "./value-menu";
import { useScreen } from "./screen-state";

const NO_TYPES = { recordTypes: [] };

const escape = (value: string) => (typeof CSS !== "undefined" ? CSS.escape(value) : value);

/** The margin line beside the current record, in pixels from the top of the text. */
interface MarginLine {
  top: number;
  height: number;
}

/**
 * The open document with its highlights in their field colours (no chips, no legend: the table is
 * the legend, and hovering a highlight names its field). A thin line in the margin marks the
 * current record's part of the document. A click on a highlight makes its record the current one
 * and opens that value's menu; selecting text opens today's menu, aimed at the current record.
 */
export function DocumentPane({
  fileId,
  definition,
}: {
  fileId: string;
  definition: ExtractionDefinitionState;
}) {
  const { currentRecordId, selectedFieldId, openValue, setCurrentRecordId, setOpenValue } =
    useScreen();
  const { scrollTargetValueId } = useFieldSelection();
  const saved = definition.saved;

  const {
    text,
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
    setAdded,
    addedValue,
    addToField,
    newRecord,
  } = useDocumentReview({
    fileId,
    definition: saved ?? NO_TYPES,
    activeRecordId: currentRecordId,
    onRecordCreated: (id) => {
      setOpenValue(null);
      setCurrentRecordId(id);
    },
  });
  const shownValueId = addedValue?.id ?? openValue?.valueId ?? null;

  // Where the last highlight was pressed: the anchor for its menu (a keyboard press has no pointer).
  const pressed = useRef<Element | null>(null);
  const selectMark = (mark: HighlightData) => {
    const target =
      pressed.current ??
      (document.activeElement instanceof Element ? document.activeElement.closest("mark") : null) ??
      findHighlight(documentRef.current, mark.valueId);
    pressed.current = null;
    const rect = target?.getBoundingClientRect();
    setAdded(null);
    setCurrentRecordId(mark.recordId);
    setOpenValue({
      valueId: mark.valueId,
      anchor: {
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        right: rect?.right ?? 0,
        bottom: rect?.bottom ?? 0,
      },
    });
  };

  // Scroll to the value the field selection points at.
  useEffect(() => {
    if (scrollTargetValueId)
      scrollToElement(findHighlight(documentRef.current, scrollTargetValueId));
  }, [scrollTargetValueId, documentRef]);

  // Esc puts the open value away (the menu closes first: it handles its own Esc and stops it).
  useEffect(() => {
    if (!openValue) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setOpenValue(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openValue, setOpenValue]);

  // The margin line: from the top of the current record's first highlight to the bottom of its last.
  const articleRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<MarginLine | null>(null);
  const measure = useCallback(() => {
    const box = articleRef.current;
    const marks =
      box && currentRecordId
        ? box.querySelectorAll(`mark[data-record-id="${escape(currentRecordId)}"]`)
        : [];
    if (!box || marks.length === 0) {
      setLine((now) => (now === null ? now : null));
      return;
    }
    const origin = box.getBoundingClientRect().top;
    let top = Infinity;
    let bottom = -Infinity;
    for (const mark of marks) {
      for (const rect of mark.getClientRects()) {
        top = Math.min(top, rect.top - origin);
        bottom = Math.max(bottom, rect.bottom - origin);
      }
    }
    const next = { top: Math.round(top), height: Math.round(bottom - top) };
    setLine((now) => (now && now.top === next.top && now.height === next.height ? now : next));
  }, [currentRecordId]);
  const ready = !!review && !loading;
  useLayoutEffect(() => {
    if (ready) measure();
  }, [measure, ready, review]);
  useEffect(() => {
    const box = articleRef.current;
    if (!box || !ready) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure, ready]);

  if (failure) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-6 sm:px-10">
        <p>
          <span className="font-semibold text-ink">Couldn&apos;t load this file.</span>{" "}
          {describeApiError(failure)}
        </p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (loading || !review || !text.data) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading document"
        className="space-y-3 px-4 py-6 sm:px-10 sm:py-8"
      >
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  return (
    <div ref={frameRef} className="relative">
      <div
        ref={documentRef}
        className="px-6 py-6 sm:px-12 sm:py-8"
        onPointerDown={(event) => {
          touchRef.current = event.pointerType === "touch";
        }}
        onClickCapture={(event) => {
          pressed.current = event.target instanceof Element ? event.target.closest("mark") : null;
        }}
        onMouseUp={() => setTimeout(() => capture(false), 0)}
        onKeyUp={(event) => {
          if (event.key === "Shift") capture(true);
        }}
      >
        {outdated && (
          <p className="mx-auto mb-4 flex max-w-[680px] items-start gap-1.5 text-small text-ink">
            <History aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              <span className="font-semibold text-warning">Out of date.</span> The document changed
              since the extraction, so highlights may be off.
            </span>
          </p>
        )}
        <div ref={articleRef} className="relative mx-auto max-w-[680px]">
          <AnnotatedMarkdown
            markdown={text.data.text}
            marks={review.marks}
            activeValueId={shownValueId}
            onMarkClick={selectMark}
            focusFieldId={selectedFieldId}
            chips={false}
          />
          {line && (
            <span
              aria-hidden
              data-testid="record-margin-line"
              className="absolute -left-4 w-0.5 rounded-pill bg-ink-muted"
              style={{ top: line.top, height: line.height }}
            />
          )}
        </div>
      </div>
      {selection && sourceText !== undefined && (
        <SelectionMenu
          text={sourceText.slice(selection.start, selection.end)}
          place={selection.place}
          focusOnOpen={selection.keyboard}
          record={
            activeRecord && activeType && records
              ? { heading: recordHeading(activeRecord, activeType, records), type: activeType }
              : null
          }
          recordTypes={saved?.recordTypes ?? []}
          labels={labels}
          pending={actions.pending}
          onAddToField={addToField}
          onNewRecord={newRecord}
          onClose={closeMenu}
        />
      )}
      <ValueMenu definition={definition} />
    </div>
  );
}
