"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { DefinitionTemplate } from "@/services/contracts";
import { templateFact } from "./template-facts";

interface TemplatePickerProps {
  templates: readonly DefinitionTemplate[];
  /** The chosen template's id, or null when none is chosen yet. */
  value: string | null;
  onChange: (templateId: string) => void;
  /** Names the group for a screen reader. Default "Start from". */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A short list to choose one template from. Native radio buttons, so the
 * arrow keys, Tab and the screen reader's "1 of 4" work as people expect.
 * It loads nothing: the host passes the templates and the chosen id.
 */
export function TemplatePicker({
  templates,
  value,
  onChange,
  label = "Start from",
  disabled,
  className,
}: TemplatePickerProps) {
  const name = useId();
  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className="mb-2 text-small font-semibold text-ink-heading">{label}</legend>
      <ul className="flex flex-col gap-1.5">
        {templates.map((template) => {
          const selected = template.id === value;
          return (
            <li key={template.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2 has-disabled:cursor-not-allowed has-disabled:opacity-60",
                  selected
                    ? "border-link bg-surface-hover"
                    : "border-border-subtle hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={template.id}
                  checked={selected}
                  onChange={() => onChange(template.id)}
                  className="mt-0.5 size-4 shrink-0 accent-link"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-body font-semibold text-ink-heading">
                    {template.name}
                  </span>
                  <span className="truncate text-small text-ink">{template.description}</span>
                  <span className="truncate text-caption text-ink-muted">
                    {templateFact(template.definition)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
