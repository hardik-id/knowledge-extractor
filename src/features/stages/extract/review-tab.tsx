"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileCode, History } from "lucide-react";
import { AnnotatedMarkdown } from "@/components/pipeline/annotated-markdown";
import { AnnotatedText, type HighlightData } from "@/components/pipeline/annotated-text";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { EmptyState } from "@/components/pipeline/empty-state";
import { SplitView } from "@/components/pipeline/split-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useExtractionActions, useFileExtraction } from "@/features/run/use-extraction";
import {
  extractionInputEtag,
  hasExtractionInput,
  useExtractionInput,
} from "@/features/run/use-extraction-input";
import { readSelection } from "@/lib/dom-selection";
import { spanFromRange } from "@/lib/text-spans";
import { cn } from "@/lib/utils";
import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldDef,
  FieldValue,
  RecordType,
  StageCell,
  TextSpan,
} from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles } from "@/store/selectors";
import type { SourceFile } from "@/types/pipeline";
import { STAGE_META } from "../config";
import { fieldLabels } from "./labels";
import { RecordsPane } from "./records-pane";
import { buildReviewMarks } from "./review-marks";
import {
  findHighlight,
  findHighlightNear,
  findRecordCard,
  findRecordValue,
  scrollToElement,
} from "./review-scroll";
import { placeMenu, recordHeading, valuesWithNew, type Place } from "./review-selection";
import { SELECTION_MENU_WIDTH, SelectionMenu } from "./selection-menu";

/** Review tab: the run's files, the document with its extracted values highlighted, and the records. */
export function ReviewTab({ definition }: { definition: ExtractionDefinition }) {
  const files = useSelectedFiles();
  const cells = usePipelineStore((s) => s.cells);
  const runFiles = usePipelineStore((s) => s.runFiles);
  const activeDocId = usePipelineStore((s) => s.activeDocId);

  // Every file with the text extraction works on can be reviewed and labelled by hand.
  const rows: Row[] = files.flatMap((file) =>
    hasExtractionInput({ cells, runFiles }, file.id)
      ? [{ file, cell: cells[file.id]?.extract }]
      : [],
  );
  const active = rows.find((row) => row.file.id === activeDocId) ?? rows[0];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={STAGE_META.extract.icon}
        title="Run the extraction to review what it finds"
        description="The values it finds will be highlighted in your documents."
      />
    );
  }

  return (
    <ReviewWorkspace
      key={active?.file.id ?? "none"}
      definition={definition}
      rows={rows}
      active={active}
    />
  );
}

interface Row {
  file: SourceFile;
  /** The extract stage's cell, once it has one. */
  cell: StageCell | undefined;
}

/** A finished text selection in the document, and where its menu goes. */
interface PendingSelection {
  start: number;
  end: number;
  place: Place;
  /** Made with the keyboard. */
  keyboard: boolean;
}

/** Everything that belongs to one open file. Keyed by file, so the selection resets when another is opened. */
function ReviewWorkspace({
  definition,
  rows,
  active,
}: {
  definition: ExtractionDefinition;
  rows: Row[];
  active: Row | undefined;
}) {
  const setActiveDoc = usePipelineStore((s) => s.setActiveDoc);
  const fileId = active?.file.id ?? null;

  const text = useExtractionInput(fileId);
  const extraction = useFileExtraction(fileId);
  const listedEtag = usePipelineStore((s) => (fileId ? extractionInputEtag(s, fileId) : null));
  // The loaded text is the truth; until it arrives, the version the store knows.
  const inputEtag = text.data?.etag ?? listedEtag;

  const [view, setView] = useState<"rendered" | "source">("rendered");
  const [activeValueId, setActiveValueId] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  // A value just added from a selection, to be made active once it is in the records.
  const [added, setAdded] = useState<{ recordId: string; fieldId: string; span: TextSpan } | null>(
    null,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef(false);
  const recordsRef = useRef<HTMLDivElement>(null);

  const actions = useExtractionActions(extraction.data);

  const labels = useMemo(() => fieldLabels(definition), [definition]);
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
  const shownValueId = addedValue?.id ?? activeValueId;

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
    setActiveValueId(null);
    setActiveRecordId(id);
    finishSelection();
  };

  const selectMark = (mark: HighlightData) => {
    setAdded(null);
    setActiveValueId(mark.valueId);
    setActiveRecordId(mark.recordId);
    scrollToElement(findRecordValue(recordsRef.current, mark.valueId));
  };
  const selectValue = (record: ExtractionRecord, value: FieldValue) => {
    setAdded(null);
    setActiveValueId(value.id);
    setActiveRecordId(record.id);
    scrollToElement(findHighlight(documentRef.current, value.id));
  };
  const selectRecord = (record: ExtractionRecord) => {
    setAdded(null);
    setActiveValueId(null);
    setActiveRecordId(record.id);
    const own = review?.marks.find((m) => m.data.recordId === record.id);
    const start = own?.start ?? review?.recordStarts.get(record.id);
    if (start !== undefined) scrollToElement(findHighlightNear(documentRef.current, start));
    scrollToElement(findRecordCard(recordsRef.current, record.id));
  };

  const legend = useMemo(() => {
    const used = new Set(records?.flatMap((r) => r.fields.map((v) => v.fieldId)));
    return [...labels.values()].filter((l) => used.has(l.field.id));
  }, [labels, records]);

  return (
    <SplitView
      listLabel="Files"
      asideLabel="Extracted records"
      list={
        <ul className="flex flex-col gap-1 p-2">
          {rows.map(({ file, cell }) => {
            const selected = active?.file.id === file.id;
            return (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => setActiveDoc(file.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                    selected
                      ? "bg-surface-raised shadow-card"
                      : "enabled:hover:bg-surface-raised/60",
                  )}
                >
                  <FileCode aria-hidden className="size-5 shrink-0 text-link" />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[14px] leading-5 font-medium text-ink">
                      {file.name}
                    </span>
                    {cell && cell.status !== "succeeded" && cell.status !== "pending" && (
                      <CellStatusLabel status={cell.status} title={cell.error?.message} />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      }
      detail={
        <div className="flex flex-col">
          <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border-subtle bg-surface-raised px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[14px] font-medium text-ink">
                {active?.file.name}
              </span>
              <div role="group" aria-label="Document view" className="flex gap-1">
                {(["rendered", "source"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={view === v ? "secondary" : "outline"}
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                  >
                    {v === "rendered" ? "Rendered" : "Source"}
                  </Button>
                ))}
              </div>
            </div>
            {legend.length > 0 && (
              <ul aria-label="Labels" className="flex flex-wrap gap-1.5">
                {legend.map((l) => (
                  <li
                    key={l.field.id}
                    className={cn(
                      "rounded-sm border px-1.5 text-[12px] leading-5 font-semibold",
                      l.style.chip,
                    )}
                  >
                    {l.field.name}
                  </li>
                ))}
              </ul>
            )}
            {!failure && !loading && (
              <p className="text-[13px] leading-[18px] text-ink-muted">
                Select text in the document to mark it yourself.
              </p>
            )}
            {outdated && (
              <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-ink">
                <History aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  <span className="font-semibold text-warning">Out of date.</span> The document
                  changed since the extraction, so highlights may be off.
                </span>
              </p>
            )}
          </div>

          <div ref={frameRef} className="relative">
            <div
              ref={documentRef}
              className="px-6 py-6"
              onPointerDown={(event) => {
                touchRef.current = event.pointerType === "touch";
              }}
              onMouseUp={() => setTimeout(() => capture(false), 0)}
              onKeyUp={(event) => {
                if (event.key === "Shift") capture(true);
              }}
            >
              {!active ? (
                <p className="text-ink-muted">Nothing to show yet.</p>
              ) : failure ? (
                <div className="flex flex-col items-start gap-3">
                  <p>
                    <span className="font-semibold text-ink">Couldn&apos;t load this file.</span>{" "}
                    {describeApiError(failure)}
                  </p>
                  <Button variant="outline" size="sm" onClick={retry}>
                    Try again
                  </Button>
                </div>
              ) : loading ? (
                <Loading label="Loading document" />
              ) : view === "rendered" ? (
                <AnnotatedMarkdown
                  markdown={text.data!.text}
                  marks={review.marks}
                  activeValueId={shownValueId}
                  onMarkClick={selectMark}
                />
              ) : (
                <AnnotatedText
                  text={text.data!.text}
                  marks={review.marks}
                  activeValueId={shownValueId}
                  onMarkClick={selectMark}
                />
              )}
            </div>
            {selection && sourceText !== undefined && (
              <SelectionMenu
                text={sourceText.slice(selection.start, selection.end)}
                place={selection.place}
                focusOnOpen={selection.keyboard}
                record={
                  activeRecord && activeType && records
                    ? {
                        heading: recordHeading(activeRecord, activeType, records),
                        type: activeType,
                      }
                    : null
                }
                recordTypes={definition.recordTypes}
                labels={labels}
                pending={actions.pending}
                onAddToField={addToField}
                onNewRecord={newRecord}
                onClose={closeMenu}
              />
            )}
          </div>
        </div>
      }
      aside={
        <div ref={recordsRef}>
          {failure ? (
            <p className="p-4 text-[15px] text-ink-muted">Records couldn&apos;t be loaded.</p>
          ) : loading || !extraction.data || !review ? (
            <div className="p-4">
              <Loading label="Loading records" />
            </div>
          ) : (
            <RecordsPane
              definition={definition}
              records={extraction.data.records}
              labels={labels}
              marked={review.marked}
              unanchored={review.unanchored}
              activeValueId={shownValueId}
              actions={actions}
              activeRecordId={activeRecordId}
              onSelectValue={selectValue}
              onSelectRecord={selectRecord}
            />
          )}
        </div>
      }
    />
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}
