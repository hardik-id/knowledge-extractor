"use client";

import { AlertCircle, ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FIELD_MODES,
  FIELD_VALUE_TYPES,
  type FieldDef,
  type FieldMode,
} from "@/services/contracts";
import { parseChoices } from "./definition-draft";

const MODE_LABEL: Record<FieldMode, string> = { quote: "Exact quote", inferred: "Inferred" };
const MODE_HELP: Record<FieldMode, string> = {
  quote: "Copied word for word from the document.",
  inferred: "Worked out by the model, with the passage it relied on.",
};
const TYPE_LABEL = { text: "Text", date: "Date", number: "Number", choice: "Choice" } as const;

interface FieldEditorProps {
  field: FieldDef;
  index: number;
  count: number;
  errors?: { name?: string; key?: string; choices?: string };
  showErrors: boolean;
  onChange: (patch: Partial<Omit<FieldDef, "id">>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}

export function Problem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 flex gap-1 text-[13px] leading-[18px] font-medium text-danger">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** One field of a record type. A card-like row: stacked below 960px, two rows from there. */
export function FieldEditor({
  field,
  index,
  count,
  errors,
  showErrors,
  onChange,
  onRemove,
  onMove,
}: FieldEditorProps) {
  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;
  const label = field.name.trim() || `field ${index + 1}`;
  // Text being typed in the choices box. Kept as text so commas can be typed.
  const [choicesText, setChoicesText] = useState(field.choices.join(", "));
  const nameError = showErrors ? errors?.name : undefined;
  const keyError = showErrors ? errors?.key : undefined;
  const choicesError = showErrors ? errors?.choices : undefined;

  return (
    <li className="rounded-lg border border-border-subtle bg-surface-tint p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
        <div>
          <Label htmlFor={id("name")}>Name</Label>
          <Input
            id={id("name")}
            value={field.name}
            placeholder="Approved by"
            aria-invalid={!!nameError}
            aria-describedby={nameError ? id("name-err") : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {nameError && <Problem id={id("name-err")}>{nameError}</Problem>}
        </div>
        <div>
          <Label htmlFor={id("key")}>Key</Label>
          <Input
            id={id("key")}
            value={field.key}
            className="font-mono"
            aria-invalid={!!keyError}
            aria-describedby={keyError ? id("key-err") : undefined}
            onChange={(e) => onChange({ key: e.target.value })}
          />
          {keyError && <Problem id={id("key-err")}>{keyError}</Problem>}
        </div>
        <div>
          <Label htmlFor={id("desc")}>What to look for</Label>
          <Input
            id={id("desc")}
            value={field.description}
            placeholder="The person or group who approved the decision"
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${label} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${label} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={onRemove}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[auto_10rem_minmax(0,1fr)_auto] md:items-start">
        <fieldset>
          <legend className="text-[13px] leading-[18px] font-semibold text-ink">
            How to take it
          </legend>
          <div
            role="radiogroup"
            className="mt-0.5 inline-flex overflow-hidden rounded-lg border border-border-control"
          >
            {FIELD_MODES.map((mode) => (
              <label
                key={mode}
                className={cn(
                  "cursor-pointer px-3 py-1 text-sm font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  field.mode === mode ? "bg-link text-bg" : "bg-surface-raised text-ink",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={id("mode")}
                  value={mode}
                  checked={field.mode === mode}
                  onChange={() => onChange({ mode })}
                />
                {MODE_LABEL[mode]}
              </label>
            ))}
          </div>
          <p className="mt-1 max-w-[28ch] text-[13px] leading-[18px] text-ink-muted">
            {MODE_LABEL[field.mode]}: {MODE_HELP[field.mode]}
          </p>
        </fieldset>
        <div>
          <Label htmlFor={id("type")}>Type</Label>
          <Select
            id={id("type")}
            value={field.valueType}
            onChange={(e) => onChange({ valueType: e.target.value as FieldDef["valueType"] })}
          >
            {FIELD_VALUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          {field.valueType === "choice" && (
            <>
              <Label htmlFor={id("choices")}>Allowed values</Label>
              <Input
                id={id("choices")}
                value={choicesText}
                placeholder="Proposed, Accepted, Rejected"
                aria-invalid={!!choicesError}
                aria-describedby={choicesError ? id("choices-err") : undefined}
                onChange={(e) => {
                  setChoicesText(e.target.value);
                  onChange({ choices: parseChoices(e.target.value) });
                }}
              />
              <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">
                Separate with commas.
              </p>
              {choicesError && <Problem id={id("choices-err")}>{choicesError}</Problem>}
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink md:mt-6">
          <input
            type="checkbox"
            className="size-4 accent-[var(--link)]"
            checked={field.multiple}
            onChange={(e) => onChange({ multiple: e.target.checked })}
          />
          Can have several values
        </label>
      </div>
    </li>
  );
}
