"use client";

import { AlertCircle, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useId } from "react";
import { appProfile } from "@/config/app-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { defaultTemplate, renderTemplate, type TemplateValues } from "@/lib/output-template";
import { OUTPUT_FORMATS, type OutputFormat, type RecordType } from "@/services/contracts";
import {
  addField,
  addRecordType,
  moveField,
  removeField,
  removeRecordType,
  setOutputFormat,
  setTemplate,
  updateField,
  updateRecordType,
} from "./definition-draft";
import { AssistantPanel } from "./assistant-panel";
import { FieldEditor, Problem } from "./field-editor";
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

export function DefineTab({ definition }: { definition: ExtractionDefinitionState }) {
  const { draft, saved, setDraft, errors, showErrors, dirty, saving, save, discard } = definition;
  const promptId = useId();
  if (!draft || !saved) return null;

  const firstType = draft.recordTypes[0];
  const keys = [...new Set(draft.recordTypes.flatMap((t) => t.fields.map((f) => f.key)))];
  const { format, template } = draft.output;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-8">
        <p className="max-w-[68ch] text-ink-muted">{appProfile.definitionNote}</p>

        {showErrors && errors.general.length > 0 && (
          <div role="alert" className="space-y-1">
            {errors.general.map((message) => (
              <Problem key={message} id={message}>
                {message}
              </Problem>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <Label htmlFor={promptId} className="text-base leading-6">
            What to extract
          </Label>
          <Textarea
            id={promptId}
            rows={4}
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            aria-describedby={`${promptId}-help`}
          />
          <p id={`${promptId}-help`} className="text-[13px] leading-[18px] text-ink-muted">
            Describe what matters in your documents, in your own words.
          </p>
        </section>

        <section className="space-y-4" aria-labelledby={`${promptId}-types`}>
          <div className="space-y-1">
            <h2 id={`${promptId}-types`} className="text-xl leading-7 font-semibold">
              Record types
            </h2>
            <p className="max-w-[68ch] text-ink-muted">
              A record type is one kind of thing to find, such as an ADR. Each has fields to fill
              in.
            </p>
          </div>

          {draft.recordTypes.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-control p-4 text-ink-muted">
              <p className="flex items-start gap-2">
                <Sparkles aria-hidden className="mt-1 size-4 shrink-0" />
                Not sure which fields you need? Describe it and let the assistant suggest them.
              </p>
            </div>
          )}

          {draft.recordTypes.map((type) => {
            const typeError = showErrors ? errors.types[type.id] : undefined;
            return (
              <div
                key={type.id}
                className="space-y-4 rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-card"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-start">
                  <div>
                    <Label htmlFor={`${type.id}-name`}>Record type name</Label>
                    <Input
                      id={`${type.id}-name`}
                      value={type.name}
                      placeholder="ADR"
                      aria-invalid={!!typeError}
                      onChange={(e) =>
                        setDraft((d) => updateRecordType(d, type.id, { name: e.target.value }))
                      }
                    />
                    {typeError && <Problem id={`${type.id}-name-err`}>{typeError}</Problem>}
                  </div>
                  <div>
                    <Label htmlFor={`${type.id}-desc`}>Description</Label>
                    <Input
                      id={`${type.id}-desc`}
                      value={type.description}
                      placeholder="An architecture decision record"
                      onChange={(e) =>
                        setDraft((d) =>
                          updateRecordType(d, type.id, { description: e.target.value }),
                        )
                      }
                    />
                  </div>
                  <div className="md:mt-6">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraft((d) => removeRecordType(d, type.id))}
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove record type
                    </Button>
                  </div>
                </div>

                {type.fields.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No fields. A record is then just the block of text it covers.
                  </p>
                ) : (
                  <ul
                    className="flex flex-col gap-3"
                    aria-label={`Fields of ${type.name || "this record type"}`}
                  >
                    {type.fields.map((field, index) => (
                      <FieldEditor
                        key={field.id}
                        field={field}
                        index={index}
                        count={type.fields.length}
                        errors={errors.fields[field.id]}
                        showErrors={showErrors}
                        onChange={(patch) =>
                          setDraft((d) => updateField(d, type.id, field.id, patch))
                        }
                        onRemove={() => setDraft((d) => removeField(d, type.id, field.id))}
                        onMove={(delta) => setDraft((d) => moveField(d, type.id, field.id, delta))}
                      />
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((d) => addField(d, type.id))}
                >
                  <Plus data-icon="inline-start" />
                  Add field
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setDraft((d) => addRecordType(d))}>
            <Plus data-icon="inline-start" />
            Add record type
          </Button>
        </section>

        <section className="space-y-4" aria-labelledby={`${promptId}-output`}>
          <h2 id={`${promptId}-output`} className="text-xl leading-7 font-semibold">
            Output
          </h2>
          <fieldset>
            <legend className="text-[13px] leading-[18px] font-semibold text-ink">Format</legend>
            <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-border-control">
              {OUTPUT_FORMATS.map((f) => (
                <label
                  key={f}
                  className={cn(
                    "cursor-pointer px-4 py-1.5 text-sm font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                    format === f ? "bg-link text-bg" : "bg-surface-raised text-ink",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${promptId}-format`}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${promptId}-template`}>Template for one record</Label>
                <Textarea
                  id={`${promptId}-template`}
                  rows={10}
                  spellCheck={false}
                  className="font-mono"
                  value={template}
                  aria-describedby={`${promptId}-template-help`}
                  onChange={(e) => setDraft((d) => setTemplate(d, e.target.value))}
                />
                <p
                  id={`${promptId}-template-help`}
                  className="text-[13px] leading-[18px] text-ink-muted"
                >
                  Write <code className="font-mono">{"{{key}}"}</code> to insert a value. For a
                  field with several values, wrap the text in{" "}
                  <code className="font-mono">{"{{#key}}…{{/key}}"}</code> and use{" "}
                  <code className="font-mono">{"{{.}}"}</code> for each value.
                </p>
                {keys.length > 0 && (
                  <ul className="flex flex-wrap items-center gap-1.5" aria-label="Available keys">
                    {keys.map((k) => (
                      <li
                        key={k}
                        className="rounded-md bg-surface-tint px-2 py-0.5 font-mono text-[13px] text-ink"
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
                <p className="text-[13px] leading-[18px] font-semibold text-ink">Preview</p>
                <pre className="max-h-80 overflow-auto rounded-lg border border-border-subtle bg-surface-tint p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap text-ink">
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

        {dirty && (
          <div
            role="status"
            className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 shadow-card"
          >
            <AlertCircle aria-hidden className="size-4 text-warning" />
            <span className="text-sm text-ink-muted">Unsaved changes</span>
            <Button variant="outline" size="sm" onClick={() => void save()} disabled={saving}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
              Discard
            </Button>
          </div>
        )}
      </div>
      <div className="order-first lg:sticky lg:top-0 lg:order-none">
        <AssistantPanel draft={draft} setDraft={setDraft} />
      </div>
    </div>
  );
}
