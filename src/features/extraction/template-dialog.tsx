"use client";

import { CircleCheck, LayoutTemplate } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import type { DefinitionTemplate, ExtractionRecord, FieldDef } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { diffProposal } from "./proposal-diff";
import { TemplatePicker } from "./template-picker";
import { recordsImpact } from "./template-impact";
import type { ExtractionDefinitionState } from "./use-extraction-definition";
import { useRunExtractions } from "./use-run-extractions";

const FORMAT_NAMES = { json: "JSON", markdown: "Markdown", csv: "CSV" } as const;

/** The quiet "Templates" link (in the page header, or on the Define tab), and the dialog it opens. */
export function TemplatesEntry({ definition }: { definition: ExtractionDefinitionState }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="link"
        size="sm"
        className="h-auto shrink-0 px-0 no-underline hover:underline"
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate data-icon="inline-start" aria-hidden />
        Templates
      </Button>
      {open && <TemplateDialog definition={definition} onClose={() => setOpen(false)} />}
    </>
  );
}

function fieldHow(field: FieldDef): string {
  const how = field.mode === "quote" ? "exact quote" : "worked out";
  return field.multiple ? `${how}, several values` : how;
}

export function TemplateDialog({
  definition,
  onClose,
}: {
  definition: ExtractionDefinitionState;
  onClose: () => void;
}) {
  const { draft, dirty, applyTemplate } = definition;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const list = useAsyncData("templates", (signal) => services.templates.list(signal));
  const { extractions, error: recordsError } = useRunExtractions();
  const records = useMemo(() => extractions?.flatMap((x) => x.records), [extractions]);

  const templates = list.data;
  const chosen = templates?.find((t) => t.id === chosenId) ?? null;
  const changes = chosen && draft ? diffProposal(draft, chosen.definition) : [];
  const same = !!chosen && changes.length === 0;
  // Until the records are known the dialog can't say what the next run does to them.
  const checking = !same && !records && !recordsError;

  const use = (template: DefinitionTemplate) => {
    applyTemplate(template);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Load a ready-made configuration into the editor. Nothing is saved until you save it.
          </DialogDescription>
        </DialogHeader>

        {list.error ? (
          <div className="flex flex-col items-start gap-3">
            <p>
              <span className="font-semibold text-ink">Couldn&apos;t load the templates.</span>{" "}
              {describeApiError(list.error, "configuration")}
            </p>
            <Button variant="outline" size="sm" onClick={list.retry}>
              Try again
            </Button>
          </div>
        ) : !templates ? (
          <div aria-busy="true" aria-label="Loading templates" className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <TemplatePicker
              templates={templates}
              value={chosenId}
              onChange={setChosenId}
              label="Template"
            />
            <section aria-label="What it would bring" className="min-w-0 space-y-3">
              {!chosen || !draft ? (
                <p className="text-ink-muted">Choose a template to see what it would bring.</p>
              ) : (
                <>
                  <TemplateContents template={chosen} />
                  <div className="space-y-2 rounded-panel bg-surface-tint p-3">
                    <h3 className="text-body font-semibold text-ink-heading">
                      Compared with the editor
                    </h3>
                    {same ? (
                      <p className="flex items-center gap-1 text-small font-semibold text-ink-muted">
                        <CircleCheck aria-hidden className="size-4 shrink-0" />
                        Already what you have
                      </p>
                    ) : (
                      <ul className="list-disc space-y-0.5 pl-5 text-small text-ink">
                        {changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    )}
                    {!same && dirty && (
                      <p className="text-small font-semibold text-ink">
                        You have unsaved changes in the editor. Using this template replaces them.
                      </p>
                    )}
                    {checking && (
                      <p className="text-small text-ink-muted">Checking your records...</p>
                    )}
                    {!same && !records && !!recordsError && (
                      <p className="text-small font-semibold text-ink">
                        Couldn&apos;t read your records, so we can&apos;t say what the next run does
                        to them.
                      </p>
                    )}
                    {!same && records && (
                      <RecordsNote
                        records={records}
                        typeIds={new Set(chosen.definition.recordTypes.map((t) => t.id))}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!chosen || same || checking}
            onClick={() => chosen && use(chosen)}
          >
            Use this template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordsNote({
  records,
  typeIds,
}: {
  records: ExtractionRecord[];
  typeIds: ReadonlySet<string>;
}) {
  const text = recordsImpact(records, typeIds);
  if (!text) return null;
  return <p className="text-small text-ink">{text}</p>;
}

/** What the template sets up, read-only and compact. */
function TemplateContents({ template }: { template: DefinitionTemplate }) {
  const { prompt, recordTypes, output } = template.definition;
  return (
    <div className="space-y-3 text-body">
      <p className="text-ink">{template.description}</p>
      <div className="space-y-1">
        <h3 className="text-small font-semibold text-ink-heading">What to extract</h3>
        <p className="max-h-24 overflow-y-auto text-ink-muted">{prompt || "Nothing yet."}</p>
      </div>
      <div className="space-y-1">
        <h3 className="text-small font-semibold text-ink-heading">Record types</h3>
        {recordTypes.length === 0 ? (
          <p className="text-ink-muted">None: it starts empty.</p>
        ) : (
          <ul className="space-y-2">
            {recordTypes.map((type) => (
              <li key={type.id}>
                <span className="font-semibold text-ink">{type.name}</span>{" "}
                <span className="text-ink-muted">· {plural(type.fields.length, "field")}</span>
                {type.fields.length > 0 && (
                  <ul className="mt-0.5 columns-1 gap-4 text-ink-muted sm:columns-2">
                    {type.fields.map((f) => (
                      <li key={f.id} className="break-inside-avoid">
                        {f.name || f.key} <span className="text-small">({fieldHow(f)})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>
        <span className="font-semibold text-ink-heading">Output format: </span>
        <span className="text-ink-muted">{FORMAT_NAMES[output.format]}</span>
      </p>
    </div>
  );
}
