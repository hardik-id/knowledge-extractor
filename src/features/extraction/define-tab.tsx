"use client";

import { AlertCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addField,
  addRecordType,
  moveField,
  removeField,
  removeRecordType,
  updateField,
  updateRecordType,
} from "./definition-draft";
import { AssistantPanel } from "./assistant-panel";
import { CELL_INPUT, FieldTable, Problem } from "./field-table";
import { OutputSettings } from "./output-settings";
import { TemplatesEntry } from "./template-dialog";
import type { ExtractionDefinitionState } from "./use-extraction-definition";

interface DefineTabProps {
  definition: ExtractionDefinitionState;
  /** Opening line, which says what the definition applies to. */
  definitionNote: string;
  /** Offer Save next to "Unsaved changes". Off where saving is its own action in the page header. */
  showSave?: boolean;
  /** Show "Templates" at the top of the tab. Off where the page header carries it. */
  showTemplates?: boolean;
  /** Show the "Unsaved changes" strip at the bottom. Off where the top bar's version menu says it. */
  showUnsavedBar?: boolean;
}

export function DefineTab({
  definition,
  definitionNote,
  showSave = true,
  showTemplates = true,
  showUnsavedBar = true,
}: DefineTabProps) {
  const { draft, saved, setDraft, errors, showErrors, dirty, saving, save, discard } = definition;
  const promptId = useId();
  if (!draft || !saved) return null;

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

          <OutputSettings draft={draft} setDraft={setDraft} />
        </div>
        <div className="order-first border-b border-border-subtle pb-4 lg:sticky lg:top-0 lg:order-none lg:border-b-0 lg:border-l lg:pb-0 lg:pl-6">
          <AssistantPanel draft={draft} setDraft={setDraft} />
        </div>
      </div>
      {dirty && showUnsavedBar && (
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
