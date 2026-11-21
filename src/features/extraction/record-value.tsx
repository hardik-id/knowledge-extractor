"use client";

import { Check, Pencil, Quote, RotateCcw, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const NOT_FOUND = "text-body text-ink-muted";
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

/**
 * A value's actions: always shown on a touch screen (under the value), and on a mouse
 * as a small floating toolbar on hover and while anything in the row has focus. They stay
 * in the page for the keyboard either way.
 */
const TOOLBAR =
  "col-start-2 mt-1 flex items-center gap-0.5 fine-hover:absolute fine-hover:top-0 fine-hover:right-0 fine-hover:mt-0 fine-hover:rounded-control fine-hover:border fine-hover:border-border-subtle fine-hover:bg-surface-raised fine-hover:p-0.5 fine-hover:opacity-0 fine-hover:shadow-float fine-hover:group-focus-within/value:opacity-100 fine-hover:group-hover/value:opacity-100";

function ToolButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden />
    </Button>
  );
}

/** Where the value came from, as a small icon: the words are its accessible name and its tooltip. */
function Origin({
  inferred,
  evidence,
  hint,
}: {
  inferred: boolean;
  evidence: string[];
  hint: boolean;
}) {
  const Icon = inferred ? Sparkles : Quote;
  const text = inferred
    ? `Inferred: worked out by the model${evidence.length > 0 ? `, from \u201c${evidence.join(" \u2026 ")}\u201d` : ""}`
    : `Quote: taken word for word from the document${hint ? `. ${QUOTE_HINT}` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={text} className="mt-0.5 inline-flex shrink-0 text-ink-muted">
          <Icon aria-hidden className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

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

  const saveEdit = async (text: string, from: FieldValue) => {
    if (!actions) return;
    const ok = await actions.setFieldValues(
      record.id,
      field.id,
      valuesAfterEdit(siblings, from.id, text),
    );
    if (ok) setEditing(false);
  };

  if (value.value === null) {
    if (!editable) return <span className={NOT_FOUND}>Not found</span>;
    if (editing) {
      return (
        <ValueEditor
          field={field}
          initial=""
          disabled={actions.pending}
          onCancel={() => setEditing(false)}
          onSave={(text) => saveEdit(text, value)}
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

  const evidence = inferred ? value.spans.map((s) => s.quote).filter(Boolean) : [];
  const rejected = value.review === "rejected";
  const stateShown = editable ? rejected || showValueState(value, record) : rejected;
  const human = editable && value.origin === "human";
  const hasMeta = stateShown || human || unanchored;

  const text = (
    <span
      className={cn(
        "block text-body break-words text-ink",
        rejected && "line-through",
        rejected && editable && "text-ink-muted",
      )}
    >
      {value.value}
    </span>
  );
  const meta = (
    <>
      {hasMeta && (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {stateShown && <ReviewStateLabel state={value.review} />}
          {human && <HumanMarker text={inferred ? "Edited by you" : "Added by you"} />}
          {unanchored && (
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-warning">
              <TriangleAlert aria-hidden className="size-3 shrink-0" />
              Not found in text
            </span>
          )}
        </span>
      )}
      {unanchored && !inferred && value.spans.length > 0 && (
        <span className="mt-0.5 block text-small break-words text-ink-muted">
          The model quoted: &ldquo;{value.spans.map((s) => s.quote).join(" \u2026 ")}&rdquo;
        </span>
      )}
    </>
  );

  const marked = canSelect && active;
  const frame = cn(
    "group/value relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5 rounded-control px-1 py-0.5",
    marked && cn("outline-2 -outline-offset-2 outline-ink-heading", label.style.highlight),
    !canSelect && "border border-dashed border-border-subtle",
    !marked && canSelect && "hover:bg-surface-tint",
  );

  if (editing && editable) {
    return (
      <div data-record-value={value.id} className={frame}>
        <div className="col-span-2 min-w-0">
          <ValueEditor
            field={field}
            initial={value.value}
            disabled={actions.pending}
            onCancel={() => setEditing(false)}
            onSave={(next) => saveEdit(next, value)}
          />
        </div>
      </div>
    );
  }

  const content = (
    <div className="min-w-0">
      {canSelect ? (
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className="block w-full rounded-control text-left"
        >
          {text}
        </button>
      ) : (
        text
      )}
      {meta}
    </div>
  );

  if (!editable) {
    return (
      <div data-record-value={value.id} className={frame}>
        <Origin inferred={inferred} evidence={evidence} hint={false} />
        {content}
      </div>
    );
  }

  const setReview = (review: ReviewState) => actions.setValueReview(record.id, value.id, review);
  const pending = actions.pending;
  const name = `${field.name} value`;

  return (
    <div data-record-value={value.id} className={frame}>
      <Origin inferred={inferred} evidence={evidence} hint />
      {content}
      <div role="group" aria-label={`Actions for ${name}`} className={TOOLBAR}>
        {rejected ? (
          <ToolButton
            label={`Undo ${name}`}
            icon={RotateCcw}
            disabled={pending}
            onClick={() => setReview("suggested")}
          />
        ) : (
          <>
            {value.review !== "accepted" && (
              <ToolButton
                label={`Accept ${name}`}
                icon={Check}
                disabled={pending}
                onClick={() => setReview("accepted")}
              />
            )}
            <ToolButton
              label={`Reject ${name}`}
              icon={X}
              disabled={pending}
              onClick={() => setReview("rejected")}
            />
            {value.review === "accepted" && (
              <ToolButton
                label={`Undo ${name}`}
                icon={RotateCcw}
                disabled={pending}
                onClick={() => setReview("suggested")}
              />
            )}
          </>
        )}
        {canEditValue(field, value) && (
          <ToolButton
            label={`Edit ${name}`}
            icon={Pencil}
            disabled={pending}
            onClick={() => setEditing(true)}
          />
        )}
        <ToolButton
          label={`Remove ${name}`}
          icon={Trash2}
          disabled={pending}
          onClick={() =>
            actions.setFieldValues(record.id, field.id, valuesAfterRemove(siblings, value.id))
          }
        />
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
