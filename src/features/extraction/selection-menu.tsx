"use client";

import { useEffect, useId, useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldDef, RecordType } from "@/services/contracts";
import type { FieldLabel } from "./labels";
import { shortenQuote, type Place } from "./review-selection";

/** Width of the menu in pixels, for placing it. */
export const SELECTION_MENU_WIDTH = 288;

export interface SelectionMenuProps {
  /** The selected text. */
  text: string;
  place: Place;
  /** The selection was made with the keyboard: focus moves into the menu. */
  focusOnOpen: boolean;
  /** The record that is selected, if any: its values can take the text. */
  record: { heading: string; type: RecordType } | null;
  recordTypes: RecordType[];
  labels: Map<string, FieldLabel>;
  /** A change is on its way: nothing can be chosen. */
  pending: boolean;
  onAddToField: (field: FieldDef) => void;
  onNewRecord: (type: RecordType) => void;
  onClose: () => void;
}

const BUTTON =
  "flex min-h-8 w-full items-center gap-2 rounded-control px-2 py-1 text-left text-body text-ink enabled:hover:bg-surface-hover disabled:opacity-50 coarse:min-h-touch";

/**
 * What can be done with the text just selected in the document: add it to a
 * field of the selected record, or start a new record with it. It sits just
 * below the selection. Arrow keys and Tab move between the buttons, Escape
 * closes it and leaves the selection as it is.
 */
export function SelectionMenu({
  text,
  place,
  focusOnOpen,
  record,
  recordTypes,
  labels,
  pending,
  onAddToField,
  onNewRecord,
  onClose,
}: SelectionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const fieldsId = useId();
  const recordsId = useId();

  // Focus: into the menu for a keyboard selection; back to where it was on Escape.
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    returnTo.current = document.activeElement;
    if (focusOnOpen) ref.current?.querySelector<HTMLButtonElement>("button:enabled")?.focus();
  }, [focusOnOpen]);

  // Pressing anywhere else closes it.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const target = returnTo.current;
      onClose();
      if (target instanceof HTMLElement && target !== document.body) target.focus();
      return;
    }
    const keys: Record<string, number> = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    };
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key in keys) next = (at + keys[event.key] + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      // Keeps the selection while the mouse is used on the menu; the keyboard still works.
      onMouseDown={(event) => event.preventDefault()}
      style={{ left: place.left, top: place.top, width: SELECTION_MENU_WIDTH }}
      className="absolute z-20 max-w-full rounded-panel border border-border-subtle bg-surface-raised p-1 text-ink shadow-float select-none"
    >
      <p
        id={titleId}
        className="truncate px-2 pt-1 pb-1.5 text-small font-semibold text-ink-heading"
      >
        <span className="sr-only">Selected text: </span>
        {shortenQuote(text)}
      </p>

      {record && record.type.fields.length > 0 && (
        <div role="group" aria-labelledby={fieldsId} className="border-t border-border-subtle pt-1">
          <p id={fieldsId} className="truncate px-2 py-1 text-caption text-ink-muted">
            Add to {record.heading}
          </p>
          {record.type.fields.map((field) => {
            const label = labels.get(field.id);
            return (
              <button
                key={field.id}
                type="button"
                disabled={pending}
                onClick={() => onAddToField(field)}
                className={BUTTON}
              >
                <span
                  className={cn(
                    "rounded-pill border px-1.5 text-caption font-semibold",
                    label?.style.chip,
                  )}
                >
                  {field.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {recordTypes.length > 0 && (
        <div
          role="group"
          aria-labelledby={recordsId}
          className="border-t border-border-subtle pt-1"
        >
          <p id={recordsId} className="px-2 py-1 text-caption text-ink-muted">
            Start a record
          </p>
          {recordTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              disabled={pending}
              onClick={() => onNewRecord(type)}
              className={BUTTON}
            >
              <Plus aria-hidden className="size-4 shrink-0 text-link" />
              New {type.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
