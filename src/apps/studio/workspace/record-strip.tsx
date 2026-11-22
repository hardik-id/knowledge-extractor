"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Check, Ellipsis } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fieldLabels, type FieldLabel } from "@/features/extraction/labels";
import { ExampleToggle, RecordActions } from "@/features/extraction/record-card";
import { HumanMarker, ReviewStateLabel } from "@/features/extraction/record-review-state";
import { saveValueEdit, ValueActions, ValueEditor } from "@/features/extraction/record-value";
import { suggestedRecordIds } from "@/features/extraction/record-rules";
import { scrollToElement } from "@/features/extraction/review-scroll";
import { recordHeading } from "@/features/extraction/review-selection";
import { useAcceptAll } from "@/features/extraction/use-accept-all";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useExtractionActions, useFileExtraction } from "@/features/run/use-extraction";
import { cn } from "@/lib/utils";
import type { ExtractionRecord, FieldValue } from "@/services/contracts";
import { indexOfRecord, neighbourId, recordsOfType } from "./records-of-type";
import { fieldsChangedSinceRun, notFoundFields, workedOutFields } from "./strip-rules";
import { useWorkspace } from "./workspace-state";

const QUIET = "text-small text-ink-muted";

/** Text cut to two lines, with "Show all" when there is more than fits. */
function ClampedText({ text, struck }: { text: string; struck: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || expanded) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <span className="block min-w-0">
      <span
        ref={box}
        className={cn(
          "block text-body break-words text-ink",
          !expanded && "line-clamp-2",
          struck && "text-ink-muted line-through",
        )}
      >
        {text}
      </span>
      {(clipped || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((now) => !now)}
          className="rounded-control text-small text-link underline underline-offset-2"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </span>
  );
}

/** One worked-out value on its line: the field's dot and name (on the first), the value and its actions. */
function ValueLine({
  record,
  value,
  siblings,
  label,
  first,
  actions,
}: {
  record: ExtractionRecord;
  value: FieldValue;
  siblings: FieldValue[];
  label: FieldLabel;
  first: boolean;
  actions: ReturnType<typeof useExtractionActions>;
}) {
  const [editing, setEditing] = useState(false);
  const { field } = label;
  const rejected = value.review === "rejected";
  return (
    <div data-record-value={value.id} className="flex items-start gap-3">
      <div className="flex w-[120px] shrink-0 items-center gap-2 pt-0.5 font-medium text-ink">
        {first && (
          <>
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-pill bg-current", label.style.text)}
            />
            <span className="min-w-0 truncate" title={field.name}>
              {field.name}
            </span>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <ValueEditor
            field={field}
            initial={value.value ?? ""}
            disabled={actions.pending}
            onCancel={() => setEditing(false)}
            onSave={async (text) => {
              if (await saveValueEdit(actions, record, field, siblings, value.id, text))
                setEditing(false);
            }}
          />
        ) : (
          <>
            <ClampedText text={value.value ?? ""} struck={rejected} />
            <span className="flex flex-wrap items-center gap-x-2">
              {rejected && <ReviewStateLabel state="rejected" />}
              {value.origin === "human" && <HumanMarker text="Edited by you" />}
            </span>
          </>
        )}
      </div>
      {!editing && (
        <ValueActions
          record={record}
          value={value}
          siblings={siblings}
          field={field}
          actions={actions}
          onEdit={() => setEditing(true)}
          className="flex shrink-0 items-center gap-0.5"
        />
      )}
    </div>
  );
}

/** Brings the record's part of the document into view. */
function showRecord(recordId: string) {
  const mark = document.querySelector(`mark[data-record-id="${CSS.escape(recordId)}"]`);
  scrollToElement(mark);
}

/**
 * "Found in this record", pinned under the document: the record navigation and its review state,
 * the values the model worked out with the same actions as a highlight's menu, and the fields with
 * nothing found. Not shown before a first run.
 */
export function RecordStrip({ definition }: { definition: ExtractionDefinitionState }) {
  const { fileId, selectedTypeId, currentRecordId, setCurrentRecordId, setOpenValue } =
    useWorkspace();
  const extraction = useFileExtraction(fileId);
  // While the records are loaded again (after a change) `extraction.data` can belong to an older key,
  // even to the empty answer from before the run: keep the last settled records, so a change is never
  // sent with the revision of those.
  const live = extraction.isLoading ? undefined : extraction.data;
  const [settled, setSettled] = useState(live);
  if (live && live !== settled) setSettled(live);
  const data = live ?? settled;
  const actions = useExtractionActions(data);
  const { acceptAll, accepting } = useAcceptAll(data?.records ?? [], actions);
  const [listOpen, setListOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const saved = definition.saved;
  const labels = useMemo(() => fieldLabels(saved ?? { recordTypes: [] }), [saved]);
  const type = saved?.recordTypes.find((t) => t.id === selectedTypeId);
  const list = useMemo(
    () => recordsOfType(data?.records ?? [], selectedTypeId),
    [data, selectedTypeId],
  );

  // Before a first run there is nothing to show (the screen then knows an empty extraction).
  if (!data || (data.revision === 0 && data.definitionVersion === 0 && data.records.length === 0))
    return null;

  const changed = fieldsChangedSinceRun(data, saved?.version);
  const record = list.find((r) => r.id === currentRecordId) ?? null;
  const index = indexOfRecord(list, record?.id ?? null);

  const go = (id: string | null) => {
    if (!id) return;
    setOpenValue(null);
    setCurrentRecordId(id);
    showRecord(id);
  };

  const workedOut = record && type ? workedOutFields(type, record) : [];
  const notFound = record && type ? notFoundFields(type, record) : [];
  const suggested = suggestedRecordIds(list).length;

  return (
    <TooltipProvider>
      <section
        aria-label="Found in this record"
        className="flex max-h-[45dvh] flex-col gap-2.5 overflow-y-auto border-t border-border-subtle bg-surface-tint px-4 pt-2.5 pb-3.5"
      >
        {!record ? (
          <p className={QUIET}>No records of this type were found in this document.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Previous record"
                disabled={index <= 0}
                onClick={() => go(neighbourId(list, record.id, "previous"))}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Next record"
                disabled={index < 0 || index >= list.length - 1}
                onClick={() => go(neighbourId(list, record.id, "next"))}
              >
                <ChevronRight aria-hidden />
              </Button>
              <Popover open={listOpen} onOpenChange={setListOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="font-semibold">
                    Record {index + 1} of {list.length}
                    <ChevronDown aria-hidden />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" aria-label="Records of this document" className="p-1">
                  <ul className="max-h-72 overflow-y-auto">
                    {list.map((item, position) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={item.id === record.id ? "true" : undefined}
                          onClick={() => {
                            setListOpen(false);
                            go(item.id);
                          }}
                          className={cn(
                            "flex min-h-8 w-full items-center gap-2 rounded-control px-2 py-1 text-left text-body text-ink hover:bg-surface-hover coarse:min-h-touch",
                            item.id === record.id && "bg-surface-tint font-semibold",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {recordHeading(item, type, list) || `Record ${position + 1}`}
                          </span>
                          <ReviewStateLabel state={item.review} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {suggested > 0 && (
                    <div className="border-t border-border-subtle p-1 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actions.pending || accepting}
                        onClick={acceptAll}
                      >
                        <Check aria-hidden />
                        Accept all suggested
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <ReviewStateLabel state={record.review} />
              {record.origin === "human" && <HumanMarker text="Added by you" />}
              <span className="flex-1" />
              <RecordActions record={record} actions={actions} />
              {record.review === "accepted" && (
                <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="More about this record"
                    >
                      <Ellipsis aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end">
                    <ExampleToggle record={record} actions={actions} />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {workedOut.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-small font-semibold text-ink-heading">
                  Worked out by the model{" "}
                  <span className="font-normal text-ink-muted">
                    These values are not written in the document as such.
                  </span>
                </h2>
                {workedOut.map(({ field, values }) =>
                  values.map((value, position) => {
                    const label = labels.get(field.id);
                    return label ? (
                      <ValueLine
                        key={value.id}
                        record={record}
                        value={value}
                        siblings={values}
                        label={label}
                        first={position === 0}
                        actions={actions}
                      />
                    ) : null;
                  }),
                )}
              </div>
            )}
            {notFound.length > 0 && (
              <p className={QUIET}>Not found: {notFound.map((f) => f.name).join(", ")}</p>
            )}
          </>
        )}
        {changed && <p className={QUIET}>Fields changed since this run</p>}
      </section>
    </TooltipProvider>
  );
}
