"use client";

import { AlertCircle, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useId } from "react";
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
import { CELL_INPUT, FieldTable, Problem } from "./field-table";
import { TemplatesEntry } from "./template-dialog";
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

interface DefineTabProps {
  definition: ExtractionDefinitionState;
  /** Opening line, which says what the definition applies to. */
  definitionNote: string;
  /** Offer Save next to "Unsaved changes". Off where saving is its own action in the page header. */
  showSave?: boolean;
  /** Show "Templates" at the top of the tab. Off where the page header carries it. */
  showTemplates?: boolean;
}

export function DefineTab({
  definition,
  definitionNote,
  showSave = true,
  showTemplates = true,
}: DefineTabProps) {
  const { draft, saved, setDraft, errors, showErrors, dirty, saving, save, discard } = definition;
  const promptId = useId();
  if (!draft || !saved) return null;

  const firstType = draft.recordTypes[0];
  const keys = [...new Set(draft.recordTypes.flatMap((t) => t.fields.map((f) => f.key)))];
  const { format, template } = draft.output;

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-0">
        <div className="flex min-w-0 flex-col gap-6 lg:pr-8">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
            <p className="max-w-[68ch] text-ink-muted">{definitionNote}</p>
            {showTemplates && <TemplatesEntry definition={definition} />}
          </div>

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
            <h2 className="text-section text-ink-heading">
              <Label htmlFor={promptId} className="text-section text-ink-heading">
                What to extract
              </Label>
            </h2>
            <Textarea
              id={promptId}
              rows={4}
              value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              aria-describedby={`${promptId}-help`}
            />
            <p id={`${promptId}-help`} className="text-small text-ink-muted">
              Describe what matters in your documents, in your own words.
            </p>
          </section>

          <section
            className="space-y-4 border-t border-border-subtle pt-6"
            aria-labelledby={`${promptId}-types`}
          >
            <div className="space-y-1">
              <h2 id={`${promptId}-types`} className="text-ink-heading">
                Record types
              </h2>
              <p className="max-w-[68ch] text-ink-muted">
                A record type is one kind of thing to find, such as an ADR. Each has fields to fill
                in. Tick Exact quote to copy a value word for word; leave it unticked and the model
                works it out, with the passage it relied on.
              </p>
            </div>

            {draft.recordTypes.length === 0 && (
              <div className="rounded-panel border border-dashed border-border-control p-4 text-ink-muted">
                <p className="flex items-start gap-2">
                  <Sparkles aria-hidden className="mt-1 size-4 shrink-0" />
                  Not sure which fields you need? Describe it and let the assistant suggest them.
                </p>
              </div>
            )}

            <div className="divide-y divide-border-subtle">
              {draft.recordTypes.map((type) => {
                const typeError = showErrors ? errors.types[type.id] : undefined;
                return (
                  <div key={type.id} className="space-y-3 py-4 first:pt-0">
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 gap-x-2 gap-y-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <div className="min-w-0">
                          <Input
                            value={type.name}
                            aria-label="Record type name"
                            placeholder="ADR"
                            className={cn(CELL_INPUT, "font-semibold text-ink-heading")}
                            aria-invalid={!!typeError}
                            aria-describedby={typeError ? `${type.id}-name-err` : undefined}
                            onChange={(e) =>
                              setDraft((d) =>
                                updateRecordType(d, type.id, { name: e.target.value }),
                              )
                            }
                          />
                          {typeError && <Problem id={`${type.id}-name-err`}>{typeError}</Problem>}
                        </div>
                        <Input
                          value={type.description}
                          aria-label="Description"
                          placeholder="An architecture decision record"
                          className={cn(CELL_INPUT, "text-ink-muted")}
                          onChange={(e) =>
                            setDraft((d) =>
                              updateRecordType(d, type.id, { description: e.target.value }),
                            )
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove record type"
                        onClick={() => setDraft((d) => removeRecordType(d, type.id))}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>

                    {type.fields.length === 0 ? (
                      <p className="text-small text-ink-muted">
                        No fields. A record is then just the block of text it covers.
                      </p>
                    ) : (
                      <FieldTable
                        caption={type.name || "this record type"}
                        fields={type.fields}
                        errors={errors.fields}
                        showErrors={showErrors}
                        onChange={(fieldId, patch) =>
                          setDraft((d) => updateField(d, type.id, fieldId, patch))
                        }
                        onRemove={(fieldId) => setDraft((d) => removeField(d, type.id, fieldId))}
                        onMove={(fieldId, delta) =>
                          setDraft((d) => moveField(d, type.id, fieldId, delta))
                        }
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft((d) => addField(d, type.id))}
                    >
                      <Plus data-icon="inline-start" />
                      Add field
                    </Button>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDraft((d) => addRecordType(d))}>
              <Plus data-icon="inline-start" />
              Add record type
            </Button>
          </section>

          <section
            className="space-y-4 border-t border-border-subtle pt-6"
            aria-labelledby={`${promptId}-output`}
          >
            <h2 id={`${promptId}-output`} className="text-ink-heading">
              Output
            </h2>
            <fieldset>
              <legend className="text-small font-medium text-ink">Format</legend>
              <div className="mt-1 inline-flex overflow-hidden rounded-control border border-border-control">
                {OUTPUT_FORMATS.map((f) => (
                  <label
                    key={f}
                    className={cn(
                      "inline-flex h-control-sm cursor-pointer items-center px-3 text-small font-medium coarse:min-h-touch",
                      format === f
                        ? "bg-link text-bg"
                        : "bg-transparent text-ink hover:bg-surface-hover",
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
              <div className="grid gap-6 md:grid-cols-2">
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
                  <p id={`${promptId}-template-help`} className="text-small text-ink-muted">
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
        </div>
        <div className="order-first border-b border-border-subtle pb-4 lg:sticky lg:top-0 lg:order-none lg:border-b-0 lg:border-l lg:pb-0 lg:pl-6">
          <AssistantPanel draft={draft} setDraft={setDraft} />
        </div>
      </div>
      {dirty && (
        <div
          role="status"
          className="sticky bottom-0 z-10 -mx-4 mt-6 -mb-4 flex flex-wrap items-center gap-3 border-t border-border-subtle bg-surface-tint px-4 py-1.5 sm:-mx-6 sm:px-6"
        >
          <AlertCircle aria-hidden className="size-4 text-warning" />
          <span className="text-small text-ink">Unsaved changes</span>
          {showSave && (
            <Button variant="secondary" size="sm" onClick={() => void save()} disabled={saving}>
              Save
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
