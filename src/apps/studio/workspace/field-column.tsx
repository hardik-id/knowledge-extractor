"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FieldTable, Problem } from "@/features/extraction/field-table";
import { fieldLabels } from "@/features/extraction/labels";
import { moveField, removeField, updateField } from "@/features/extraction/definition-draft";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useAssistant } from "@/features/extraction/use-assistant";
import { StartPanel } from "../start/start-panel";
import { AssistantDock } from "./assistant-dock";
import { PromptLine } from "./prompt-line";
import { focusAssistantInput } from "./use-proposal";
import { ProposalBar, ProposalLines, ProposedFieldRows, ProposedTypes } from "./proposal-table";
import { RecordTypeBar } from "./record-type-bar";
import { useFieldSelection } from "./use-field-selection";
import { useScreenControls, useWorkspace } from "./workspace-state";

/**
 * The right column: the record type, the prompt, the field table (today's Define table, edited in
 * the draft) and the assistant at the bottom. The table is the only part that scrolls.
 */
export function FieldColumn({ definition }: { definition: ExtractionDefinitionState }) {
  const { draft, saved, setDraft, errors, showErrors } = definition;
  const { selectedTypeId, selectedFieldId, proposal, setConversationOpen } = useWorkspace();
  const controls = useScreenControls();
  const scroller = useRef<HTMLDivElement>(null);
  const selection = useFieldSelection();
  // Said to screen readers when the bar that held Keep all and Discard all has gone.
  const [decision, setDecision] = useState("");

  // The dots match the highlights, which are coloured by the saved fields; a field not saved yet takes its place in the draft.
  const savedLabels = useMemo(() => fieldLabels(saved ?? { recordTypes: [] }), [saved]);
  const draftLabels = useMemo(() => fieldLabels(draft ?? { recordTypes: [] }), [draft]);
  // Nothing saved, nothing drafted, nothing proposed: the way in is the start panel.
  const starting =
    !!saved &&
    !!draft &&
    saved.recordTypes.length === 0 &&
    draft.recordTypes.length === 0 &&
    proposal == null;

  // "Assistant" in the top bar: open the conversation and put the cursor in the input. Below
  // 1100px the column has just mounted in its overlay, so wait for it to settle.
  const requested = controls?.assistantRequested ?? false;
  const answer = controls?.answerAssistantRequest;
  useEffect(() => {
    if (!requested) return;
    setConversationOpen(true);
    answer?.();
    // Not cleared on cleanup: answering the request re-runs this effect at once.
    setTimeout(focusAssistantInput, 300);
  }, [requested, answer, setConversationOpen]);

  // Leaving the start panel removes the focused button: move focus to the new content. Focus that
  // sits elsewhere (the assistant's input) stays where it is.
  const wasStarting = useRef(false);
  useEffect(() => {
    if (wasStarting.current && !starting) {
      const active = document.activeElement;
      if (!active || active === document.body || scroller.current?.contains(active))
        scroller.current?.focus();
    }
    wasStarting.current = starting;
  }, [starting]);

  if (!draft) return null;
  const type = draft.recordTypes.find((t) => t.id === selectedTypeId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!starting && <RecordTypeBar definition={definition} />}
      {!starting && <PromptLine definition={definition} />}
      <div ref={scroller} tabIndex={-1} role="region" aria-label="Field list" className="min-h-0 flex-1 overflow-y-auto outline-none">
        {starting && (
          <div className="px-4 py-4">
            <StartPanelWithAssistant definition={definition} />
          </div>
        )}
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
        {starting ? null : !type ? (
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
                <ProposedFieldRows typeId={type.id} />
              </tbody>
            </table>
          </>
        ) : (
          <FieldTable
            caption={type.name || "this record type"}
            fields={type.fields}
            errors={errors.fields}
            showErrors={showErrors}
            onChange={(fieldId, patch) => setDraft((d) => updateField(d, type.id, fieldId, patch))}
            onRemove={(fieldId) => setDraft((d) => removeField(d, type.id, fieldId))}
            onMove={(fieldId, delta) => setDraft((d) => moveField(d, type.id, fieldId, delta))}
            colourDot={(fieldId) => (savedLabels.get(fieldId) ?? draftLabels.get(fieldId))!.style}
            descriptionUnderName
            selectedFieldId={selectedFieldId}
            onRowSelect={selection.toggle}
            afterRow={(field) => <ProposalLines field={field} />}
            extraRows={<ProposedFieldRows typeId={type.id} />}
          />
        )}
        {/* A record type the proposal adds, also while there is no record type yet. */}
        <ProposedTypes />
      </div>
      <p role="status" className="sr-only">
        {decision}
      </p>
      <AssistantDock definition={definition} />
    </div>
  );
}

/** The start panel's own conversation hook, so it only exists while the panel does. */
function StartPanelWithAssistant({ definition }: { definition: ExtractionDefinitionState }) {
  const assistant = useAssistant(definition.draft ?? undefined);
  return <StartPanel definition={definition} assistant={assistant} />;
}
