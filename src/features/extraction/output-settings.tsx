"use client";

import { RotateCcw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { defaultTemplate, renderTemplate, type TemplateValues } from "@/lib/output-template";
import { OUTPUT_FORMATS, type OutputFormat, type RecordType } from "@/services/contracts";
import { setOutputFormat, setTemplate } from "./definition-draft";
import type { ExtractionDefinitionState } from "./use-extraction-definition";

const FORMAT_LABEL: Record<OutputFormat, string> = {
  json: "JSON",
  markdown: "Markdown",
  csv: "CSV",
};

/** Example values for the template preview: each field's name in brackets. */
function sampleValues(recordType: RecordType): TemplateValues {
  const values: TemplateValues = {};
  for (const f of recordType.fields) {
    const sample = `<${f.name.trim() || f.key}>`;
    values[f.key] = f.multiple ? [`${sample} 1`, `${sample} 2`] : sample;
  }
  return values;
}

type Draft = NonNullable<ExtractionDefinitionState["draft"]>;

/** The Output section of the definition: the format and, for Markdown, the template with its preview. */
export function OutputSettings({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: ExtractionDefinitionState["setDraft"];
}) {
  const id = useId();
  const firstType = draft.recordTypes[0];
  const keys = [...new Set(draft.recordTypes.flatMap((t) => t.fields.map((f) => f.key)))];
  const { format, template } = draft.output;

  return (
    <section
      className="space-y-4 border-t border-border-subtle pt-6"
      aria-labelledby={`${id}-output`}
    >
      <h2 id={`${id}-output`} className="text-ink-heading">
        Output
      </h2>
      <fieldset>
        <legend className="text-small font-medium text-ink">Format</legend>
        {/* No overflow clipping here: the focused option's ring is drawn outside it, as
          everywhere else, because on the chosen option's fill it would not show. */}
        <div className="mt-1 inline-flex rounded-control border border-border-control">
          {OUTPUT_FORMATS.map((f) => (
            <label
              key={f}
              className={cn(
                "inline-flex h-control-sm cursor-pointer items-center px-3 text-small font-medium first:rounded-l-control last:rounded-r-control has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring coarse:min-h-touch",
                format === f ? "bg-link text-bg" : "bg-transparent text-ink hover:bg-surface-hover",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={`${id}-format`}
                value={f}
                checked={format === f}
                onChange={() => setDraft((d) => setOutputFormat(d, f))}
              />
              {FORMAT_LABEL[f]}
            </label>
          ))}
        </div>
      </fieldset>

      {format === "markdown" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-template`}>Template for one record</Label>
            <Textarea
              id={`${id}-template`}
              rows={10}
              spellCheck={false}
              className="font-mono"
              value={template}
              aria-describedby={`${id}-template-help`}
              onChange={(e) => setDraft((d) => setTemplate(d, e.target.value))}
            />
            <p id={`${id}-template-help`} className="text-small text-ink-muted">
              Write <code className="font-mono">{"{{key}}"}</code> to insert a value. For a field
              with several values, wrap the text in{" "}
              <code className="font-mono">{"{{#key}}…{{/key}}"}</code> and use{" "}
              <code className="font-mono">{"{{.}}"}</code> for each value.
            </p>
            {keys.length > 0 && (
              <ul className="flex flex-wrap items-center gap-1.5" aria-label="Available keys">
                {keys.map((k) => (
                  <li
                    key={k}
                    className="rounded-control bg-surface-tint px-2 py-0.5 font-mono text-small text-ink"
                  >
                    {k}
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!firstType}
              onClick={() =>
                firstType && setDraft((d) => setTemplate(d, defaultTemplate(firstType)))
              }
            >
              <RotateCcw data-icon="inline-start" />
              Reset to default
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-small font-medium text-ink">Preview</p>
            <pre
              tabIndex={0}
              className="max-h-80 overflow-auto rounded-panel bg-surface-tint p-3 font-mono text-small whitespace-pre-wrap text-ink"
            >
              {firstType
                ? renderTemplate(
                    template.trim() === "" ? defaultTemplate(firstType) : template,
                    sampleValues(firstType),
                  )
                : "Add a record type to see a preview."}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
