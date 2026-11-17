"use client";

import { Check, Pencil, Quote, RotateCcw, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ExtractionRecord, FieldDef, FieldValue, ReviewState } from "@/services/contracts";
import type { ExtractionActions } from "@/features/run/use-extraction";
import type { FieldLabel } from "./labels";
import {
  canEditValue,
  cleanEditedText,
  editorKind,
  showValueState,
  valuesAfterAdd,
  valuesAfterEdit,
  valuesAfterRemove,
} from "./record-rules";
import { HumanMarker, ReviewStateLabel } from "./record-review-state";

const NOT_FOUND = "text-[15px] leading-[22px] text-ink-muted";
const QUOTE_HINT = "Select text in the document to change this";

/** A text, date, number or choice input with Save and Cancel. Enter saves, Escape cancels. */
function ValueEditor({
  field,
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  field: FieldDef;
  initial: string;
  disabled: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const kind = editorKind(field);
  const text = cleanEditedText(draft);
  const save = () => {
    if (text !== null && !disabled) onSave(text);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  const common = {
    autoFocus: true,
    "aria-label": `${field.name} value`,
    value: draft,
    onKeyDown,
  };
  return (
    <div className="flex flex-col gap-2">
      {kind === "choice" ? (
        <Select {...common} onChange={(e) => setDraft(e.target.value)}>
          {!field.choices.includes(draft) && <option value={draft}>{draft || "Choose one"}</option>}
          {field.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          {...common}
          type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
          onChange={(e) => setDraft(e.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled || text === null}
          onClick={save}
        >
          <Check aria-hidden />
          Save
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          <X aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Shown on hover or focus on wide screens, always on small ones. */
const REVEAL =
  "flex flex-wrap gap-1 md:opacity-0 md:group-focus-within/value:opacity-100 md:group-hover/value:opacity-100";

interface ValueRowProps {
  record: ExtractionRecord;
  value: FieldValue;
  /** Every value of this field in the record. */
  siblings: FieldValue[];
  label: FieldLabel;
  canSelect: boolean;
  unanchored: boolean;
  active: boolean;
  onSelect: () => void;
  actions?: ExtractionActions;
  readOnly?: boolean;
}

export function ValueRow({
  record,
  value,
  siblings,
  label,
  canSelect,
  unanchored,
  active,
  onSelect,
  actions,
  readOnly,
}: ValueRowProps) {
  const editable = !!actions && !readOnly;
  const [editing, setEditing] = useState(false);
  const field = label.field;
  const inferred = field.mode === "inferred";

  if (value.value === null) {
    if (!editable) return <span className={NOT_FOUND}>Not found</span>;
    if (editing) {
      return (
        <ValueEditor
          field={field}
          initial=""
          disabled={actions.pending}
          onCancel={() => setEditing(false)}
          onSave={async (text) => {
            const ok = await actions.setFieldValues(
              record.id,
              field.id,
              valuesAfterEdit(siblings, value.id, text),
            );
            if (ok) setEditing(false);
          }}
        />
      );
    }
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className={NOT_FOUND}>Not found</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={actions.pending}
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden />
          Edit
        </Button>
      </span>
    );
  }

  const ModeIcon = inferred ? Sparkles : Quote;
  const evidence = inferred ? value.spans.map((s) => s.quote).filter(Boolean) : [];
  const rejected = value.review === "rejected";
  const stateShown = editable ? rejected || showValueState(value, record) : rejected;

  const body = (
    <>
      <span
        className={cn(
          "block text-[15px] leading-[22px] break-words text-ink",
          rejected && "line-through",
          rejected && editable && "text-ink-muted",
        )}
      >
        {value.value}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-4 text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <ModeIcon aria-hidden className="size-3.5 shrink-0" />
          {inferred ? "Inferred" : "Quote"}
        </span>
        {stateShown && <ReviewStateLabel state={value.review} />}
        {editable && value.origin === "human" && (
          <HumanMarker text={inferred ? "Edited by you" : "Added by you"} />
        )}
        {unanchored && (
          <span className="inline-flex items-center gap-1 font-semibold text-warning">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            Not found in text
          </span>
        )}
      </span>
      {evidence.map((quote, i) => (
        <span key={i} className="mt-1 block text-[13px] leading-[18px] break-words text-ink-muted">
          &ldquo;{quote}&rdquo;
        </span>
      ))}
      {unanchored && !inferred && value.spans.length > 0 && (
        <span className="mt-1 block text-[13px] leading-[18px] break-words text-ink-muted">
          The model quoted: &ldquo;{value.spans.map((s) => s.quote).join(" … ")}&rdquo;
        </span>
      )}
    </>
  );

  const frame = "w-full rounded-md border px-2 py-1.5 text-left";
  const focusRing =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link";

  if (!editable) {
    if (!canSelect) {
      return (
        <div
          data-record-value={value.id}
          className={cn(frame, "border-dashed border-border-subtle")}
        >
          {body}
        </div>
      );
    }
    return (
      <button
        type="button"
        data-record-value={value.id}
        aria-pressed={active}
        onClick={onSelect}
        className={cn(
          frame,
          "transition-colors",
          focusRing,
          active
            ? cn("border-2 border-ink-heading", label.style.highlight)
            : "border-border-subtle hover:bg-surface-tint",
        )}
      >
        {body}
      </button>
    );
  }

  const setReview = (review: ReviewState) => actions.setValueReview(record.id, value.id, review);
  const canEdit = canEditValue(field, value);
  const wrapper = cn(
    frame,
    "group/value",
    !canSelect && "border-dashed border-border-subtle",
    canSelect &&
      (active ? cn("border-2 border-ink-heading", label.style.highlight) : "border-border-subtle"),
  );

  if (editing) {
    return (
      <div data-record-value={value.id} className={wrapper}>
        <ValueEditor
          field={field}
          initial={value.value}
          disabled={actions.pending}
          onCancel={() => setEditing(false)}
          onSave={async (text) => {
            const ok = await actions.setFieldValues(
              record.id,
              field.id,
              valuesAfterEdit(siblings, value.id, text),
            );
            if (ok) setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div data-record-value={value.id} className={wrapper}>
      {canSelect ? (
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className={cn("block w-full rounded-sm text-left", focusRing)}
        >
          {body}
        </button>
      ) : (
        body
      )}
      <div className={cn(REVEAL, "mt-1")}>
        {rejected ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={actions.pending}
            onClick={() => setReview("suggested")}
          >
            <RotateCcw aria-hidden />
            Undo
          </Button>
        ) : (
          <>
            {value.review !== "accepted" && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={actions.pending}
                onClick={() => setReview("accepted")}
              >
                <Check aria-hidden />
                Accept
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={actions.pending}
              onClick={() => setReview("rejected")}
            >
              <X aria-hidden />
              Reject
            </Button>
            {value.review === "accepted" && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={actions.pending}
                onClick={() => setReview("suggested")}
              >
                <RotateCcw aria-hidden />
                Undo
              </Button>
            )}
          </>
        )}
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={actions.pending}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        ) : (
          <span
            title={QUOTE_HINT}
            className="inline-flex items-center text-[12px] leading-4 text-ink-muted"
          >
            {QUOTE_HINT}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={actions.pending}
          onClick={() =>
            actions.setFieldValues(record.id, field.id, valuesAfterRemove(siblings, value.id))
          }
        >
          <Trash2 aria-hidden />
          Remove
        </Button>
      </div>
    </div>
  );
}

/** A field with no values at all: "Not found", with a way to type one in. */
export function EmptyValue({
  record,
  siblings,
  field,
  actions,
  readOnly,
}: {
  record: ExtractionRecord;
  siblings: FieldValue[];
  field: FieldDef;
  actions?: ExtractionActions;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!actions || readOnly) return <span className={NOT_FOUND}>Not found</span>;
  if (editing) {
    return (
      <ValueEditor
        field={field}
        initial=""
        disabled={actions.pending}
        onCancel={() => setEditing(false)}
        onSave={async (text) => {
          const ok = await actions.setFieldValues(
            record.id,
            field.id,
            valuesAfterAdd(siblings, text),
          );
          if (ok) setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={NOT_FOUND}>Not found</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={actions.pending}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
        Edit
      </Button>
    </span>
  );
}
