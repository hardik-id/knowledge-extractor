"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Ellipsis } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fieldLabels, type FieldLabel } from "@/features/extraction/labels";
import { ExampleToggle, RecordActions } from "@/features/extraction/record-card";
import { HumanMarker, ReviewStateLabel } from "@/features/extraction/record-review-state";
import { saveValueEdit, ValueActions, ValueEditor } from "@/features/extraction/record-value";
import { suggestedRecordIds } from "@/features/extraction/record-rules";
import { findHighlight, scrollToElement } from "@/features/extraction/review-scroll";
import { useAcceptAll } from "@/features/extraction/use-accept-all";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useExtractionActions, useFileExtraction } from "@/features/run/use-extraction";
import { useExtractionInput } from "@/features/run/use-extraction-input";
import { cn } from "@/lib/utils";
import type { ExtractionRecord, FieldDef, FieldValue } from "@/services/contracts";
import { indexOfRecord, neighbourId, recordsOfType } from "./records-of-type";
import {
  fieldsChangedSinceRun,
  stripFields,
  type StripField,
  type StripValue,
} from "./strip-rules";
import { useFieldSelection } from "./use-field-selection";
import { useScreenControls, useWorkspace } from "./workspace-state";

const QUIET = "text-small text-ink-muted";

/** Text cut to two lines, with "Show all" when there is more than fits. */
function ClampedText({
  text,
  struck,
  showLabel,
  onShow,
}: {
  text: string;
  struck: boolean;
  /** A placed quote: the text is a button that leads to its highlight in the document. */
  showLabel?: string;
  onShow?: () => void;
}) {
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
  const body = (
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
  );
  return (
    <span className="block min-w-0">
      {onShow ? (
        <button
          type="button"
          aria-label={showLabel}
          onClick={onShow}
          className="block w-full rounded-control text-left hover:underline hover:underline-offset-2"
        >
          {body}
        </button>
      ) : (
        body
      )}
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

/** Leads to a value's highlight in the document and puts the focus on it. */
function showInDocument(valueId: string) {
  const mark = findHighlight(document, valueId);
  if (!(mark instanceof HTMLElement)) return;
  scrollToElement(mark);
  mark.focus({ preventScroll: true });
}

const WORKED_OUT_TITLE = "The model worked this out; it is not written in the document as such.";

/**
 * One line of the strip: the field's dot and name (on the first line of the field), the value and
 * its actions, or "Not found" when the field has none.
 */
function StripLine({
  record,
  field,
  label,
  workedOut,
  entry,
  siblings,
  first,
  selected,
  onToggleField,
  actions,
}: {
  record: ExtractionRecord;
  field: FieldDef;
  label: FieldLabel;
  workedOut: boolean;
  entry: StripValue | null;
  siblings: FieldValue[];
  first: boolean;
  selected: boolean;
  onToggleField: () => void;
  actions: ReturnType<typeof useExtractionActions>;
}) {
  const [editing, setEditing] = useState(false);
  const value = entry?.value ?? null;
  return (
    <div
      data-strip-line={field.id}
      data-record-value={value?.id}
      className={cn("flex items-start gap-3 rounded-control px-1", selected && "bg-surface-hover")}
    >
      <div className="flex h-8 w-[8rem] shrink-0 flex-col justify-center sm:w-[15.5rem] sm:flex-row sm:items-center sm:justify-start sm:gap-1.5">
        {first && (
          <>
            <button
              type="button"
              aria-pressed={selected}
              onClick={onToggleField}
              title={field.name}
              className="flex max-w-[150px] min-w-0 items-center gap-2 rounded-control text-left font-medium text-ink"
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-pill bg-current", label.style.text)}
              />
              <span className="min-w-0 truncate">{field.name}</span>
            </button>
            {workedOut && (
              <Badge variant="secondary" title={WORKED_OUT_TITLE} className="shrink-0">
                worked out
              </Badge>
            )}
          </>
        )}
      </div>
      <div className="min-w-0 flex-1 pt-1.5">
        {!value || !entry ? (
          <span className={QUIET}>Not found</span>
        ) : editing ? (
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
            <ClampedText
              text={value.value ?? ""}
              struck={entry.rejected}
              showLabel={`Show in the document: ${field.name}, ${value.value ?? ""}`}
              onShow={entry.placed ? () => showInDocument(value.id) : undefined}
            />
            <span className="flex flex-wrap items-center gap-x-2">
              {entry.rejected && <ReviewStateLabel state="rejected" />}
              {entry.notInText && (
                <span className="text-caption text-ink-muted">not in the document as written</span>
              )}
              {value.origin === "human" && <HumanMarker text="Edited by you" />}
            </span>
          </>
        )}
      </div>
      {value && !editing && (
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
  const documentText = useExtractionInput(fileId).data?.text;
  const controls = useScreenControls();
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = controls ? controls.stripCollapsed : localCollapsed;
  const setCollapsed = controls ? controls.setStripCollapsed : setLocalCollapsed;
  const { selectedFieldId, toggle } = useFieldSelection();
  const [listOpen, setListOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const focusInside = useRef(false);
  // A button that leaves the strip when it is used (Undo of the last Rejected line, Reject that moves a
  // value into the strip) would drop focus to the page start: keep it in the strip instead.
  useEffect(() => {
    const section = sectionRef.current;
    // Not while one of the strip's popovers is open: its own buttons manage focus there.
    if (
      focusInside.current &&
      !listOpen &&
      !optionsOpen &&
      section &&
      document.activeElement === document.body
    )
      section.focus();
  });
  // While the records are loaded again (after a change) `extraction.data` can belong to an older key,
  // even to the empty answer from before the run: keep the last settled records, so a change is never
  // sent with the revision of those.
  const live = extraction.isLoading ? undefined : extraction.data;
  const [settled, setSettled] = useState(live);
  if (live && live !== settled) setSettled(live);
  const data = live ?? settled;
  const actions = useExtractionActions(data);

  const saved = definition.saved;
  const labels = useMemo(() => fieldLabels(saved ?? { recordTypes: [] }), [saved]);
  const type = saved?.recordTypes.find((t) => t.id === selectedTypeId);
  const list = useMemo(
    () => recordsOfType(data?.records ?? [], selectedTypeId),
    [data, selectedTypeId],
  );
  // "Accept all suggested" acts on the records the list shows: this type's, not the whole document's.
  const { acceptAll, accepting } = useAcceptAll(list, actions);
  // The list's headings, worked out once: the first field's value, or "<Type> <n>".
  const headings = useMemo(() => {
    const firstId = type?.fields[0]?.id;
    return list.map((item, position) => {
      const first = firstId ? item.fields.find((v) => v.fieldId === firstId) : null;
      return first?.value?.trim() || `${type?.name ?? "Record"} ${position + 1}`;
    });
  }, [list, type]);

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

  const fields = record && type ? stripFields(type, record, documentText) : [];
  const suggested = suggestedRecordIds(list).length;

  const lines = (entry: StripField) => {
    const label = labels.get(entry.field.id);
    if (!label || !record) return null;
    const common = {
      record,
      field: entry.field,
      label,
      workedOut: entry.workedOut,
      selected: selectedFieldId === entry.field.id,
      onToggleField: () => toggle(entry.field.id),
      actions,
    };
    if (entry.values.length === 0)
      return <StripLine key={entry.field.id} {...common} entry={null} siblings={[]} first />;
    // The field's other values too: a change to one is saved with the rest.
    const siblings = record.fields.filter((v) => v.fieldId === entry.field.id && v.value !== null);
    return entry.values.map((item, position) => (
      <StripLine
        key={item.value.id}
        {...common}
        entry={item}
        siblings={siblings}
        first={position === 0}
      />
    ));
  };

  return (
    <TooltipProvider>
      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-label="Found in this record"
        onFocus={() => {
          focusInside.current = true;
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next))
            focusInside.current = false;
        }}
        className="flex max-h-[45dvh] flex-col gap-2.5 overflow-y-auto border-t border-border-subtle bg-surface-tint px-4 pt-2.5 pb-3.5 outline-none"
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
                          <span className="min-w-0 flex-1 truncate">{headings[position]}</span>
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Show the record's values" : "Hide the record's values"}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              </Button>
            </div>

            {!collapsed && (
              <div className="flex flex-col gap-0.5">{fields.map((entry) => lines(entry))}</div>
            )}
          </>
        )}
        {changed && <p className={QUIET}>Fields changed since this run</p>}
      </section>
    </TooltipProvider>
  );
}
