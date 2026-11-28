"use client";

import type { LabelStyle } from "@/features/extraction/labels";
import { cn } from "@/lib/utils";
import { fieldFacts } from "./read-only-facts";
import type { FieldDef } from "@/services/contracts";

/**
 * The fields of a record type as a list, for a person who may read the configuration and not
 * change it: the colour dot, the name, what to look for, the type in words, and "Exact quote" and
 * "Several values" where they apply. A click on a field selects it (that only changes the
 * highlights); Esc clears it, as in the editable table.
 */
export function ReadOnlyFields({
  caption,
  fields,
  colourDot,
  selectedFieldId,
  onSelect,
}: {
  /** Names the list: the record type's name. */
  caption: string;
  fields: FieldDef[];
  colourDot: (fieldId: string) => LabelStyle;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
}) {
  return (
    <ul aria-label={`Fields of ${caption}`} data-testid="read-only-fields">
      {fields.map((field) => {
        const selected = selectedFieldId === field.id;
        return (
          <li key={field.id} className="border-b border-border-subtle">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(field.id)}
              className={cn(
                "flex w-full items-start gap-2 py-2 pr-3 pl-4 text-left hover:bg-surface-hover",
                selected && "bg-surface-hover",
              )}
            >
              <span
                aria-hidden
                data-testid="field-dot"
                className={cn(
                  "mt-2 size-2 shrink-0 rounded-pill bg-current",
                  colourDot(field.id).text,
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("break-words text-ink", selected && "font-semibold")}>
                  {field.name}
                </span>
                {field.description && (
                  <span className="text-small break-words text-ink-muted">{field.description}</span>
                )}
                <span className="text-small text-ink-muted">{fieldFacts(field)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
