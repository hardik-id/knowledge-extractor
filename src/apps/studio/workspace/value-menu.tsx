"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { fieldLabels } from "@/features/extraction/labels";
import { ReviewStateLabel } from "@/features/extraction/record-review-state";
import { saveValueEdit, ValueActions, ValueEditor } from "@/features/extraction/record-value";
import { findHighlight } from "@/features/extraction/review-scroll";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useExtractionActions, useFileExtraction } from "@/features/run/use-extraction";
import { cn } from "@/lib/utils";
import type { ExtractionRecord } from "@/services/contracts";
import { useWorkspace } from "./workspace-state";

function findValue(records: readonly ExtractionRecord[] | undefined, valueId: string | null) {
  if (!records || !valueId) return null;
  for (const record of records) {
    const value = record.fields.find((v) => v.id === valueId);
    if (value) return { record, value };
  }
  return null;
}

/**
 * The actions on one value (accept, reject, correct, remove), in a small menu at its highlight.
 * It reads `openValue` from the workspace state: the highlight's place when it was pressed, then
 * the highlight itself while it is on screen, so the menu follows the document's scrolling.
 * Esc closes it and focus goes back to the highlight.
 */
export function ValueMenu({ definition }: { definition: ExtractionDefinitionState }) {
  const { fileId, openValue, setOpenValue } = useWorkspace();
  const extraction = useFileExtraction(fileId);
  // Keep the last settled records while they load again, so a change is never sent with the
  // revision of an older key's answer.
  const live = extraction.isLoading ? undefined : extraction.data;
  const [settled, setSettled] = useState(live);
  if (live && live !== settled) setSettled(live);
  const data = live ?? settled;
  const actions = useExtractionActions(data);
  const [editing, setEditing] = useState<string | null>(null);

  const records = data?.records;
  const valueId = openValue?.valueId ?? null;

  // When the menu closes, focus goes back to the highlight. The records usually change at the same
  // moment and the document paints its highlights again, so it is tried after every render for a
  // moment, until the highlight has it or the person has moved on.
  const lastValueId = useRef<string | null>(null);
  const refocus = useRef<{ valueId: string; until: number } | null>(null);
  const tryRefocus = () => {
    const wanted = refocus.current;
    if (!wanted) return;
    const mark = findHighlight(document, wanted.valueId);
    const active = document.activeElement;
    const free = !active || active === document.body;
    if (Date.now() > wanted.until || (!free && active !== mark)) {
      refocus.current = null;
    } else if (mark instanceof HTMLElement && active !== mark) {
      mark.focus();
    }
  };
  useEffect(() => {
    const was = lastValueId.current;
    lastValueId.current = valueId;
    if (!valueId && was) refocus.current = { valueId: was, until: Date.now() + 1500 };
    else if (valueId) refocus.current = null;
    tryRefocus();
    if (!refocus.current) return;
    const timer = setInterval(tryRefocus, 50);
    return () => clearInterval(timer);
  });

  const found = findValue(records, valueId);
  const labels = useMemo(
    () => fieldLabels(definition.saved ?? { recordTypes: [] }),
    [definition.saved],
  );

  // The value is gone (removed, or the records were replaced): the menu has nothing to show.
  useEffect(() => {
    if (valueId && records && !found) setOpenValue(null);
  }, [valueId, records, found, setOpenValue]);

  const anchor = openValue?.anchor;
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          (valueId ? findHighlight(document, valueId) : null)?.getBoundingClientRect() ??
          DOMRect.fromRect({
            x: anchor?.left ?? 0,
            y: anchor?.top ?? 0,
            width: (anchor?.right ?? 0) - (anchor?.left ?? 0),
            height: (anchor?.bottom ?? 0) - (anchor?.top ?? 0),
          }),
      },
    }),
    [valueId, anchor],
  );

  if (!openValue || !found) return null;
  const { record, value } = found;
  const label = labels.get(value.fieldId);
  if (!label) return null;
  const { field } = label;
  const siblings = record.fields.filter((v) => v.fieldId === field.id);
  const close = () => {
    setEditing(null);
    setOpenValue(null);
  };
  const isEditing = editing === value.id;

  return (
    <Popover open onOpenChange={(open) => !open && close()}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent
        align="start"
        aria-label={`Value of ${field.name}`}
        className="flex flex-col gap-2"
        onEscapeKeyDown={(event) => {
          // While correcting, Esc only cancels the correction.
          if (isEditing) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-pill bg-current", label.style.text)}
          />
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink-heading">
            {field.name}
          </span>
          <ReviewStateLabel state={value.review} />
        </div>
        {isEditing ? (
          <ValueEditor
            field={field}
            initial={value.value ?? ""}
            disabled={actions.pending}
            onCancel={() => setEditing(null)}
            onSave={async (text) => {
              if (await saveValueEdit(actions, record, field, siblings, value.id, text)) close();
            }}
          />
        ) : (
          <>
            <p
              className={cn(
                "line-clamp-4 text-body break-words text-ink",
                value.review === "rejected" && "text-ink-muted line-through",
              )}
            >
              {value.value}
            </p>
            <ValueActions
              record={record}
              value={value}
              siblings={siblings}
              field={field}
              actions={actions}
              labelled
              onEdit={() => setEditing(value.id)}
              onChanged={close}
              className="flex flex-wrap items-center gap-0.5"
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
