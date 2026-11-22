"use client";

import { useMemo, useRef, useState } from "react";
import { FileCode, History } from "lucide-react";
import { AnnotatedMarkdown } from "@/components/pipeline/annotated-markdown";
import { AnnotatedText, type HighlightData } from "@/components/pipeline/annotated-text";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { EmptyState } from "@/components/pipeline/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { hasExtractionInput } from "@/features/run/use-extraction-input";
import { cn } from "@/lib/utils";
import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldValue,
  StageCell,
} from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles } from "@/store/selectors";
import type { SourceFile } from "@/types/pipeline";
import { STAGE_META } from "@/features/stages/config";
import { RecordsPane } from "./records-pane";
import { FileList, ReviewPanes, Segmented } from "./review-panes";
import {
  findHighlight,
  findHighlightNear,
  findRecordCard,
  findRecordValue,
  scrollToElement,
} from "./review-scroll";
import { recordHeading } from "./review-selection";
import { SelectionMenu } from "./selection-menu";
import { useDocumentReview } from "./use-document-review";

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

  const [view, setView] = useState<"rendered" | "source">("rendered");
  const [activeValueId, setActiveValueId] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const recordsRef = useRef<HTMLDivElement>(null);

  const {
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
    setAdded,
    addedValue,
    addToField,
    newRecord,
  } = useDocumentReview({
    fileId,
    definition,
    activeRecordId,
    onRecordCreated: (id) => {
      setActiveValueId(null);
      setActiveRecordId(id);
    },
  });
  const shownValueId = addedValue?.id ?? activeValueId;

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
    <ReviewPanes
      listLabel="Files"
      asideLabel="Extracted records"
      list={
        <FileList
          icon={FileCode}
          activeId={active?.file.id}
          onSelect={setActiveDoc}
          items={rows.map(({ file, cell }) => ({
            id: file.id,
            name: file.name,
            note:
              cell && cell.status !== "succeeded" && cell.status !== "pending" ? (
                <CellStatusLabel status={cell.status} title={cell.error?.message} />
              ) : undefined,
          }))}
        />
      }
      detail={
        <div className="flex flex-col">
          <div className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border-subtle bg-background px-4 py-2 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-small font-medium text-ink">
                {active?.file.name}
              </span>
              <Segmented
                label="Document view"
                value={view}
                onChange={setView}
                options={[
                  { value: "rendered", label: "Rendered" },
                  { value: "source", label: "Source" },
                ]}
              />
            </div>
            {legend.length > 0 && (
              <ul
                aria-label="Labels"
                // One line; a long one scrolls sideways, and the keyboard can reach it.
                tabIndex={0}
                className="flex gap-1 overflow-x-auto pb-0.5"
              >
                {legend.map((l) => (
                  <li
                    key={l.field.id}
                    className={cn(
                      "shrink-0 rounded-pill border px-1.5 text-caption font-semibold",
                      l.style.chip,
                    )}
                  >
                    {l.field.name}
                  </li>
                ))}
              </ul>
            )}
            {!failure && !loading && (
              <p className="text-caption text-ink-muted">
                Select text in the document to mark it yourself.
              </p>
            )}
            {outdated && (
              <p className="flex items-start gap-1.5 text-small text-ink">
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
              className="px-4 py-4 sm:px-6"
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
              ) : loading || !review ? (
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
            <p className="p-4 text-body text-ink-muted">Records couldn&apos;t be loaded.</p>
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
    <div role="status" aria-busy="true" aria-label={label} className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}
