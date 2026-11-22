"use client";

import { AlertCircle, MoreHorizontal } from "lucide-react";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { deriveKey, parseChoices } from "./definition-draft";
import type { LabelStyle } from "./labels";

const TYPE_LABEL = { text: "Text", date: "Date", number: "Number", choice: "Choice" } as const;

type FieldErrors = { name?: string; key?: string; choices?: string };

export function Problem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 flex gap-1 text-small font-medium text-danger">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The columns, header and rows alike. Below 25rem: three equal columns and the menu. From 25rem:
 * field, type, two tick columns, menu. From 40rem: "What to look for" gets the rest.
 */
const GRID =
  "grid grid-cols-[repeat(3,minmax(0,1fr))_2.5rem] @min-[25rem]:grid-cols-[minmax(0,1fr)_7rem_4rem_4rem_2.5rem] @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7rem_4rem_4rem_2.5rem]";

/** Looks like plain text in a table cell until it is hovered or focused. */
export const CELL_INPUT =
  "border-transparent bg-transparent hover:border-border-control focus-visible:bg-surface-raised aria-invalid:border-danger";

/** The small label shown only where the rows are stacked (a narrow table). */
function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="mb-0.5 block text-small font-semibold text-ink @min-[25rem]:hidden"
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
  /** A coloured dot before each name, in the field's label colour. */
  colourDot?: (fieldId: string) => LabelStyle;
  /** "What to look for" always sits under the name, whatever the width. */
  descriptionUnderName?: boolean;
  /** The selected field: its row gets `aria-selected`. */
  selectedFieldId?: string | null;
  /** A click on a row outside its controls (the field's id), or Esc on the table (null). */
  onRowSelect?: (fieldId: string | null) => void;
  /** Rendered as a full-width row under the field's row (nothing when it returns nothing). */
  afterRow?: (field: FieldDef) => ReactNode;
  /** Rendered after the last row: it must be table rows (`tr`). */
  extraRows?: ReactNode;
}

/** The classes without the ones for the widest layout, for a table that keeps "What to look for" under the name. */
const narrowOnly = (classes: string) =>
  classes
    .split(" ")
    .filter((c) => !c.startsWith("@min-[40rem]:"))
    .join(" ");

/** True for the controls of a row: a click on them is theirs, not a selection of the row. */
function isControl(target: EventTarget | null, row: HTMLElement): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== row) {
    if (node.matches("input, select, textarea, button, a, label, [role='checkbox'], [role='menu']"))
      return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * The fields of one record type: a row per field, a column per property, tick boxes for the
 * yes/no ones. Three layouts from the width of the table itself, in one markup: from 40rem a
 * column for "What to look for"; from 25rem that text sits under the name; below 25rem the rows
 * stack, each cell under its label. Every part is a grid, so the header and the rows share
 * their columns.
 */
export function FieldTable({
  caption,
  fields,
  errors,
  showErrors,
  onChange,
  onRemove,
  onMove,
  colourDot,
  descriptionUnderName = false,
  selectedFieldId,
  onRowSelect,
  afterRow,
  extraRows,
}: FieldTableProps) {
  const grid = descriptionUnderName ? narrowOnly(GRID) : GRID;
  return (
    <div className="@container">
      <table
        className="block w-full text-body"
        onKeyDown={(event) => {
          // Esc on the table clears the selection; an Esc that closed a menu (portalled, outside it) does not.
          if (event.key !== "Escape" || event.defaultPrevented || !onRowSelect) return;
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (selectedFieldId != null) onRowSelect(null);
        }}
      >
        <caption className="sr-only">Fields of {caption}</caption>
        <thead className="block @max-[25rem]:sr-only">
          <tr className={`${grid} border-b border-border-subtle text-left text-small text-ink`}>
            <th scope="col" className="px-1 py-2 font-semibold">
              {descriptionUnderName ? "Field and what to look for" : "Field"}
            </th>
            {!descriptionUnderName && (
              <th scope="col" className="hidden px-1 py-2 font-semibold @min-[40rem]:block">
                What to look for
              </th>
            )}
            <th scope="col" className="px-1 py-2 font-semibold">
              Type
            </th>
            <th scope="col" className="px-1 py-2 font-semibold">
              Exact quote
            </th>
            <th scope="col" className="px-1 py-2 font-semibold">
              Several values
            </th>
            <th scope="col" className="px-1 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="block">
          {fields.map((field, index) => {
            const after = afterRow?.(field);
            return (
              <Fragment key={field.id}>
                <FieldRow
                  field={field}
                  others={fields.filter((f) => f.id !== field.id).map((f) => f.key)}
                  index={index}
                  count={fields.length}
                  errors={showErrors ? errors[field.id] : undefined}
                  onChange={(patch) => onChange(field.id, patch)}
                  onRemove={() => onRemove(field.id)}
                  onMove={(delta) => onMove(field.id, delta)}
                  dot={colourDot?.(field.id)}
                  underName={descriptionUnderName}
                  selected={onRowSelect ? selectedFieldId === field.id : undefined}
                  onSelect={onRowSelect ? () => onRowSelect(field.id) : undefined}
                />
                {after != null && after !== false && (
                  <tr className="block">
                    <td className="block">{after}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {extraRows}
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
  dot?: LabelStyle;
  underName: boolean;
  /** Undefined when rows cannot be selected. */
  selected?: boolean;
  onSelect?: () => void;
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
  dot,
  underName,
  selected,
  onSelect,
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

  const cell = "min-w-0 px-1 py-1 @min-[25rem]:py-0.5 @min-[40rem]:py-1";
  // Where each cell sits: below 25rem stacked, from 25rem the text under the name, from 40rem
  // in its own column. Written out in full so Tailwind can see every class.
  const nameCell =
    "@max-[24rem]:col-span-3 @min-[25rem]:col-start-1 @min-[25rem]:row-start-1 @min-[25rem]:pb-0 @min-[40rem]:pb-1";
  const descCell =
    "col-span-2 @max-[24rem]:col-span-4 @min-[25rem]:col-span-4 @min-[25rem]:col-start-1 @min-[25rem]:row-start-2 @min-[25rem]:pt-0 @min-[40rem]:col-span-1 @min-[40rem]:col-start-2 @min-[40rem]:row-start-1 @min-[40rem]:pt-1";
  const typeCell =
    "@max-[24rem]:col-span-4 @min-[25rem]:col-start-2 @min-[25rem]:row-start-1 @min-[40rem]:col-start-3";
  const quoteCell =
    "@max-[24rem]:col-span-2 @min-[25rem]:col-start-3 @min-[25rem]:row-start-1 @min-[40rem]:col-start-4";
  const multipleCell =
    "@max-[24rem]:col-span-2 @min-[25rem]:col-start-4 @min-[25rem]:row-start-1 @min-[40rem]:col-start-5";
  // The allowed values of a Choice field get their own line across the whole row.
  const choicesCell =
    "col-span-full @min-[25rem]:col-start-1 @min-[25rem]:row-start-3 @min-[40rem]:row-start-2 @min-[25rem]:pt-0";
  const menuCell =
    "col-start-4 row-start-1 @min-[25rem]:col-start-5 @min-[25rem]:row-span-2 @min-[40rem]:row-span-1 @min-[40rem]:col-start-6";

  const place = (classes: string) => (underName ? narrowOnly(classes) : classes);
  const grid = place(GRID);

  return (
    <tr
      aria-selected={selected}
      onClick={
        onSelect
          ? (event) => {
              if (!isControl(event.target, event.currentTarget)) onSelect();
            }
          : undefined
      }
      className={cn(
        `${grid} border-b border-border-subtle py-2 @min-[25rem]:py-0`,
        !onSelect && "last:border-b-0",
        onSelect && "cursor-pointer",
        selected && "bg-surface-hover",
      )}
    >
      <td className={`${cell} ${place(nameCell)}`}>
        <CellLabel>Field</CellLabel>
        <div className="flex items-center gap-1">
          {dot && (
            <span
              aria-hidden
              data-testid="field-dot"
              className={cn("ml-1 size-2 shrink-0 rounded-pill bg-current", dot.text)}
            />
          )}
          <Input
            value={field.name}
            aria-label={`Name of field ${index + 1}`}
            placeholder="Approved by"
            className={cn(CELL_INPUT, selected && "font-semibold")}
            aria-invalid={!!errors?.name}
            aria-describedby={errors?.name ? id("name-err") : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        {errors?.name && <Problem id={id("name-err")}>{errors.name}</Problem>}
        {showKey && (
          <div className="mt-1">
            <Input
              ref={keyRef}
              value={field.key}
              aria-label={`Key for ${label}`}
              className="h-control-sm font-mono"
              aria-invalid={!!errors?.key}
              aria-describedby={errors?.key ? id("key-err") : undefined}
              onChange={(e) => onChange({ key: e.target.value })}
            />
            {errors?.key && <Problem id={id("key-err")}>{errors.key}</Problem>}
          </div>
        )}
      </td>
      <td className={`${cell} ${place(descCell)}`}>
        <CellLabel>What to look for</CellLabel>
        <Input
          value={field.description}
          aria-label={`What to look for in ${label}`}
          placeholder="The person who approved it"
          className={`${CELL_INPUT} ${place("@min-[25rem]:text-ink-muted @min-[40rem]:text-ink")}`}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </td>
      <td className={`${cell} ${place(typeCell)}`}>
        <CellLabel>Type</CellLabel>
        <Select
          className={CELL_INPUT}
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
      </td>
      {field.valueType === "choice" && (
        <td className={`${cell} ${place(choicesCell)}`}>
          <div className="flex items-center gap-2">
            <span aria-hidden className="shrink-0 text-small text-ink-muted">
              Allowed values
            </span>
            <Input
              value={choicesText}
              aria-label={`Allowed values for ${label}`}
              placeholder="Proposed, Accepted"
              title="Separate with commas"
              className={CELL_INPUT}
              aria-invalid={!!errors?.choices}
              aria-describedby={errors?.choices ? id("choices-err") : undefined}
              onChange={(e) => {
                setChoicesText(e.target.value);
                onChange({ choices: parseChoices(e.target.value) });
              }}
            />
          </div>
          {errors?.choices && <Problem id={id("choices-err")}>{errors.choices}</Problem>}
        </td>
      )}
      <td className={`${cell} ${place(quoteCell)}`}>
        <label className="flex items-center gap-2 py-1.5">
          <Checkbox
            aria-label={`Exact quote for ${label}`}
            checked={field.mode === "quote"}
            onCheckedChange={(on) => onChange({ mode: on === true ? "quote" : "inferred" })}
          />
          <span aria-hidden className="text-small @min-[25rem]:hidden">
            Exact quote
          </span>
        </label>
      </td>
      <td className={`${cell} ${place(multipleCell)}`}>
        <label className="flex items-center gap-2 py-1.5">
          <Checkbox
            aria-label={`Several values for ${label}`}
            checked={field.multiple}
            onCheckedChange={(on) => onChange({ multiple: on === true })}
          />
          <span aria-hidden className="text-small @min-[25rem]:hidden">
            Several values
          </span>
        </label>
      </td>
      <td className={`${cell} ${place(menuCell)} text-right`}>
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
