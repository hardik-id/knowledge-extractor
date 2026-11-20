"use client";

import { AlertCircle, MoreHorizontal } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FIELD_VALUE_TYPES, type FieldDef } from "@/services/contracts";
import { deriveKey, parseChoices } from "./definition-draft";

const TYPE_LABEL = { text: "Text", date: "Date", number: "Number", choice: "Choice" } as const;

type FieldErrors = { name?: string; key?: string; choices?: string };

export function Problem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 flex gap-1 text-[13px] leading-[18px] font-medium text-danger">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Looks like plain text in a table cell until it is hovered or focused. */
const CELL_INPUT =
  "border-transparent bg-transparent hover:border-border-control focus-visible:bg-surface-raised aria-invalid:border-destructive";

/** The small label shown only where the rows are stacked (a narrow table). */
function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="mb-0.5 block text-[13px] leading-[18px] font-semibold text-ink @min-[36rem]:hidden"
    >
      {children}
    </span>
  );
}

interface FieldTableProps {
  /** Names the table: the record type's name. */
  caption: string;
  fields: FieldDef[];
  errors: Record<string, FieldErrors>;
  showErrors: boolean;
  onChange: (fieldId: string, patch: Partial<Omit<FieldDef, "id">>) => void;
  onRemove: (fieldId: string) => void;
  onMove: (fieldId: string, delta: -1 | 1) => void;
}

/**
 * The fields of one record type: a row per field, a column per property, tick boxes for the
 * yes/no ones. Below about 36rem of its own width the rows stack, each cell under its label.
 */
export function FieldTable({
  caption,
  fields,
  errors,
  showErrors,
  onChange,
  onRemove,
  onMove,
}: FieldTableProps) {
  return (
    <div className="@container">
      <table className="w-full table-fixed border-collapse text-sm @max-[36rem]:block">
        <caption className="sr-only">Fields of {caption}</caption>
        <thead className="@max-[36rem]:sr-only">
          <tr className="border-b border-border-subtle text-left text-[13px] leading-[18px] text-ink">
            <th scope="col" className="w-[24%] px-1 py-2 font-semibold">
              Field
            </th>
            <th scope="col" className="px-1 py-2 font-semibold">
              What to look for
            </th>
            <th scope="col" className="w-[24%] px-1 py-2 font-semibold">
              Type
            </th>
            <th scope="col" className="w-[4.5rem] px-1 py-2 font-semibold">
              Exact quote
            </th>
            <th scope="col" className="w-[4.5rem] px-1 py-2 font-semibold">
              Several values
            </th>
            <th scope="col" className="w-10 px-1 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="@max-[36rem]:block">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              others={fields.filter((f) => f.id !== field.id).map((f) => f.key)}
              index={index}
              count={fields.length}
              errors={showErrors ? errors[field.id] : undefined}
              onChange={(patch) => onChange(field.id, patch)}
              onRemove={() => onRemove(field.id)}
              onMove={(delta) => onMove(field.id, delta)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FieldRowProps {
  field: FieldDef;
  /** The keys of the other fields, to tell whether this key still follows the name. */
  others: string[];
  index: number;
  count: number;
  errors?: FieldErrors;
  onChange: (patch: Partial<Omit<FieldDef, "id">>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}

function FieldRow({
  field,
  others,
  index,
  count,
  errors,
  onChange,
  onRemove,
  onMove,
}: FieldRowProps) {
  const uid = useId();
  const id = (part: string) => `${uid}-${part}`;
  const label = field.name.trim() || `field ${index + 1}`;
  // Text being typed in the allowed values box. Kept as text so commas can be typed.
  const [choicesText, setChoicesText] = useState(field.choices.join(", "));
  const [keyOpen, setKeyOpen] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const focusKey = useRef(false);

  // The key shows by itself when it was edited by hand or has a problem.
  const edited = field.key !== deriveKey(field.name, others);
  const showKey = keyOpen || edited || !!errors?.key;

  const cell = "px-1 py-1.5 align-top @max-[36rem]:min-w-0 @max-[36rem]:py-1";
  const stackedFirst = "@max-[24rem]:col-span-3";
  const stackedWide = "@max-[36rem]:col-span-2 @max-[24rem]:col-span-4";

  return (
    <tr className="border-b border-border-subtle last:border-b-0 @max-[36rem]:grid @max-[36rem]:grid-cols-[repeat(3,minmax(0,1fr))_2.5rem] @max-[36rem]:py-2">
      <td className={`${cell} ${stackedFirst}`}>
        <CellLabel>Field</CellLabel>
        <Input
          value={field.name}
          aria-label={`Name of field ${index + 1}`}
          placeholder="Approved by"
          className={CELL_INPUT}
          aria-invalid={!!errors?.name}
          aria-describedby={errors?.name ? id("name-err") : undefined}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {errors?.name && <Problem id={id("name-err")}>{errors.name}</Problem>}
        {showKey && (
          <div className="mt-1">
            <Input
              ref={keyRef}
              value={field.key}
              aria-label={`Key for ${label}`}
              className="h-7 font-mono text-[13px]"
              aria-invalid={!!errors?.key}
              aria-describedby={errors?.key ? id("key-err") : undefined}
              onChange={(e) => onChange({ key: e.target.value })}
            />
            {errors?.key && <Problem id={id("key-err")}>{errors.key}</Problem>}
          </div>
        )}
      </td>
      <td className={`${cell} ${stackedWide}`}>
        <CellLabel>What to look for</CellLabel>
        <Input
          value={field.description}
          aria-label={`What to look for in ${label}`}
          placeholder="The person who approved it"
          className={CELL_INPUT}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </td>
      <td className={`${cell} @max-[24rem]:col-span-4`}>
        <CellLabel>Type</CellLabel>
        <Select
          value={field.valueType}
          aria-label={`Type of ${label}`}
          onChange={(e) => onChange({ valueType: e.target.value as FieldDef["valueType"] })}
        >
          {FIELD_VALUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        {field.valueType === "choice" && (
          <div className="mt-1">
            <Input
              value={choicesText}
              aria-label={`Allowed values for ${label}`}
              placeholder="Proposed, Accepted"
              title="Separate with commas"
              aria-invalid={!!errors?.choices}
              aria-describedby={errors?.choices ? id("choices-err") : undefined}
              onChange={(e) => {
                setChoicesText(e.target.value);
                onChange({ choices: parseChoices(e.target.value) });
              }}
            />
            {errors?.choices && <Problem id={id("choices-err")}>{errors.choices}</Problem>}
          </div>
        )}
      </td>
      <td className={`${cell} @max-[24rem]:col-span-2`}>
        <label className="flex items-center gap-2 py-1.5">
          <Checkbox
            aria-label={`Exact quote for ${label}`}
            checked={field.mode === "quote"}
            onCheckedChange={(on) => onChange({ mode: on === true ? "quote" : "inferred" })}
          />
          <span aria-hidden className="text-[13px] leading-4 @min-[36rem]:hidden">
            Exact quote
          </span>
        </label>
      </td>
      <td className={`${cell} @max-[24rem]:col-span-2`}>
        <label className="flex items-center gap-2 py-1.5">
          <Checkbox
            aria-label={`Several values for ${label}`}
            checked={field.multiple}
            onCheckedChange={(on) => onChange({ multiple: on === true })}
          />
          <span aria-hidden className="text-[13px] leading-4 @min-[36rem]:hidden">
            Several values
          </span>
        </label>
      </td>
      <td className={`${cell} text-right @max-[36rem]:col-start-4 @max-[36rem]:row-start-1`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${label}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40"
            onCloseAutoFocus={(e) => {
              // Closing returns focus to the menu button, except after "Edit key".
              if (!focusKey.current) return;
              focusKey.current = false;
              e.preventDefault();
              keyRef.current?.focus();
            }}
          >
            <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
              Move down
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                focusKey.current = true;
                setKeyOpen(true);
              }}
            >
              Edit key
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
