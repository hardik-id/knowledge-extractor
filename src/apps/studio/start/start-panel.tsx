"use client";

import { LoaderCircle, Plus, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import type { AssistantState } from "@/features/extraction/use-assistant";
import { plural } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import { offerProposal } from "../working-screen/use-proposal";
import {
  startFromScratch,
  startTemplates,
  suggestMessage,
  templateFieldCount,
} from "./start-rules";

interface StartPanelProps {
  definition: ExtractionDefinitionState;
  /** The conversation, from `useAssistant(draft)`. */
  assistant: AssistantState;
}

/**
 * The conversation's empty state in a workspace with an empty configuration: ask the assistant, start from a
 * template, or add a field yourself. Each way ends with a configuration to keep or discard.
 */
export function StartPanel({ definition, assistant }: StartPanelProps) {
  const askId = useId();
  const [text, setText] = useState("");
  const templates = useAsyncData("templates", (signal) => services.templates.list(signal));
  const rows = startTemplates(templates.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby={askId}>
        <h2 id={askId} className="text-section text-ink-heading">
          What do you want from these documents?
        </h2>
        <p className="text-ink-muted">
          Say it in your own words. The assistant reads the document and suggests fields. You keep
          the ones that fit.
        </p>
        <Textarea
          aria-labelledby={askId}
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="For example: one record per rule, with what it says, who it applies to and from when"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            size="lg"
            disabled={assistant.busy || !definition.draft}
            onClick={() => {
              void assistant.send(suggestMessage(text));
            }}
          >
            {assistant.busy ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            Suggest fields
          </Button>
          <span role="status" className="sr-only">
            {assistant.busy ? "Asking the assistant…" : ""}
          </span>
          <span className="text-small text-ink-muted">
            Leave it empty to suggest from the open document.
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2 border-t border-border-subtle pt-6">
        <h2 className="text-ink-heading">Or start from a template</h2>
        {templates.isLoading && !templates.data ? (
          <Skeleton className="h-24 w-full" />
        ) : templates.error !== undefined ? (
          <p role="status" className="text-small text-ink-muted">
            The templates could not be loaded.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() =>
                    offerProposal({
                      id: `template:${template.id}`,
                      proposal: { definition: template.definition, reasons: [] },
                      onKeepAll: () => definition.applyTemplate(template),
                    })
                  }
                  className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-panel border border-border-subtle bg-background px-3 py-2.5 text-left text-body text-ink hover:bg-surface-hover sm:flex-nowrap"
                >
                  <span className="font-medium">{template.name}</span>
                  <span className="order-last w-full min-w-0 text-small text-ink-muted sm:order-none sm:w-auto sm:flex-1">
                    {template.description}
                  </span>
                  <span className="ml-auto text-small whitespace-nowrap text-ink-muted sm:ml-0">
                    {plural(templateFieldCount(template), "field")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-small text-ink-muted">
          A template fills the list as suggestions. Nothing is kept until you say so.
        </p>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border-subtle pt-6">
        <h2 className="text-ink-heading">Or start fresh</h2>
        <Button
          variant="outline"
          disabled={!definition.draft}
          onClick={() => definition.setDraft((draft) => startFromScratch(draft))}
        >
          <Plus data-icon="inline-start" />
          Add a field yourself
        </Button>
      </section>
    </div>
  );
}
