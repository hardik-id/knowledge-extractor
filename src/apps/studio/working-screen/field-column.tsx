"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FieldTable, Problem } from "@/features/extraction/field-table";
import { fieldLabels } from "@/features/extraction/labels";
import { moveField, removeField, updateField } from "@/features/extraction/definition-draft";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { AssistantDock } from "./assistant-dock";
import { configurationSummary } from "./configuration-summary";
import { ChunkingRow } from "./chunking-row";
import { PromptLine } from "./prompt-line";
import { focusAssistantInputWhenMounted, type ProposalInfo } from "./use-proposal";
import { ProposalBar, ProposalLines, ProposedFieldRows, ProposedTypes } from "./proposal-table";
import { RecordTypeBar } from "./record-type-bar";
import { useFieldSelection } from "./use-field-selection";
import { useScreenControls, useScreen } from "./screen-state";

/**
 * The right column: the "Configuration" row, closed on a first visit, and the assistant under it,
 * always open. Open, the row shows the record type, the prompt, the chunking and the field table
 * (today's Define table, edited in the draft) between itself and the assistant; that part scrolls,
 * and the assistant keeps at least 240px and 40% of the column.
 */
export function FieldColumn({ definition }: { definition: ExtractionDefinitionState }) {
  const { draft, saved, setDraft, errors, showErrors, valid, chunkingProblem } = definition;
  const { selectedTypeId, selectedFieldId, proposal, configurationOpen, setConfigurationOpen } =
    useScreen();
  const controls = useScreenControls();
  const scroller = useRef<HTMLDivElement>(null);
  const selection = useFieldSelection();
  const panelId = useId();
  // Said to screen readers when the bar that held Keep all and Discard all has gone.
  const [decision, setDecision] = useState("");

  // The dots match the highlights, which are coloured by the saved fields; a field not saved yet takes its place in the draft.
  const savedLabels = useMemo(() => fieldLabels(saved ?? { recordTypes: [] }), [saved]);
  const draftLabels = useMemo(() => fieldLabels(draft ?? { recordTypes: [] }), [draft]);
  // Nothing saved, nothing drafted, nothing proposed: the way in is the start content of the conversation.
  const starting =
    !!saved &&
    !!draft &&
    saved.recordTypes.length === 0 &&
    draft.recordTypes.length === 0 &&
    proposal == null;

  // A save that was refused because of a problem in the configuration: the problems must be seen.
  const mustShow = (showErrors && !valid) || !!chunkingProblem;
  useEffect(() => {
    if (mustShow) setConfigurationOpen(true);
  }, [mustShow, setConfigurationOpen]);

  // PART 2 (#267) REMOVES THIS RULE: until the suggestion is a card in the conversation, it is
  // shown in the table, so Configuration opens by itself when a suggestion arrives or a template is
  // offered. It does not change what the person chose to remember.
  const suggestion = (proposal as ProposalInfo | null)?.messageId ?? null;
  const seenSuggestion = useRef<string | null>(null);
  useEffect(() => {
    if (suggestion && suggestion !== seenSuggestion.current) setConfigurationOpen(true);
    seenSuggestion.current = suggestion;
  }, [suggestion, setConfigurationOpen]);

  // "Assistant" in the top bar: put the cursor in the input. Below 1100px the column has just
  // mounted in its overlay, so wait until the input is there.
  const requested = controls?.assistantRequested ?? false;
  const answer = controls?.answerAssistantRequest;
  useEffect(() => {
    if (!requested) return;
    answer?.();
    // Not cancelled on cleanup: answering the request re-runs this effect at once.
    focusAssistantInputWhenMounted();
  }, [requested, answer]);

  if (!draft) return null;
  const type = draft.recordTypes.find((t) => t.id === selectedTypeId);
  const suggested = (proposal as ProposalInfo | null)?.changes.length ?? 0;
  const Chevron = configurationOpen ? ChevronDown : ChevronRight;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        aria-expanded={configurationOpen}
        aria-controls={panelId}
        onClick={() => setConfigurationOpen(!configurationOpen, true)}
        className="flex w-full shrink-0 items-center gap-2 border-b border-border-subtle py-1.5 pr-3 pl-4 text-left hover:bg-surface-hover"
      >
        <span className="font-semibold text-ink-heading">Configuration</span>
        <span className="min-w-0 flex-1 truncate text-small text-ink-muted">
          {configurationSummary(draft, suggested)}
        </span>
        <Chevron aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
      </button>
      <div
        id={panelId}
        hidden={!configurationOpen}
        data-testid="configuration-panel"
        className="max-h-[calc(100%-max(240px,40%))] min-h-0 shrink overflow-y-auto border-b border-border-subtle"
      >
        {configurationOpen && (
          <>
            {!starting && <RecordTypeBar definition={definition} />}
            {!starting && <PromptLine definition={definition} />}
            {!starting && <ChunkingRow definition={definition} />}
            <div
              ref={scroller}
              tabIndex={-1}
              role="region"
              aria-label="Field list"
              className="outline-none"
            >
              <ProposalBar definition={definition} onDecided={setDecision} />
              {showErrors && errors.general.length > 0 && (
                <div role="alert" className="space-y-1 px-4 py-2">
                  {errors.general.map((message) => (
                    <Problem key={message} id={message}>
                      {message}
                    </Problem>
                  ))}
                </div>
              )}
              {starting ? (
                <p className="px-4 py-4 text-ink-muted">No fields yet.</p>
              ) : !type ? (
                proposal == null && <p className="px-4 py-4 text-ink-muted">No fields yet.</p>
              ) : type.fields.length === 0 ? (
                <>
                  <p className="px-4 py-4 text-small text-ink-muted">
                    No fields. A record is then just the block of text it covers.
                  </p>
                  {/* A field the assistant suggests has to show even when there is no table yet. */}
                  <table className="block w-full">
                    <caption className="sr-only">Suggested fields</caption>
                    <tbody className="block">
                      <ProposedFieldRows
                        typeId={type.id}
                        definition={definition}
                        onDecided={setDecision}
                      />
                    </tbody>
                  </table>
                </>
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
                  colourDot={(fieldId) =>
                    (savedLabels.get(fieldId) ?? draftLabels.get(fieldId))!.style
                  }
                  descriptionUnderName
                  selectedFieldId={selectedFieldId}
                  onRowSelect={selection.toggle}
                  afterRow={(field) => (
                    <ProposalLines field={field} definition={definition} onDecided={setDecision} />
                  )}
                  extraRows={
                    <ProposedFieldRows
                      typeId={type.id}
                      definition={definition}
                      onDecided={setDecision}
                    />
                  }
                />
              )}
              {/* A record type the proposal adds, also while there is no record type yet. */}
              <ProposedTypes definition={definition} onDecided={setDecision} />
            </div>
          </>
        )}
      </div>
      <p role="status" className="sr-only">
        {decision}
      </p>
      <AssistantDock definition={definition} starting={starting} />
    </div>
  );
}
