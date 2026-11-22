"use client";

import { useMemo, useState } from "react";
import { FieldTable, Problem } from "@/features/extraction/field-table";
import { fieldLabels } from "@/features/extraction/labels";
import { moveField, removeField, updateField } from "@/features/extraction/definition-draft";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { AssistantDock } from "./assistant-dock";
import { PromptLine } from "./prompt-line";
import { ProposalBar, ProposalLines, ProposedFieldRows, ProposedTypes } from "./proposal-table";
import { RecordTypeBar } from "./record-type-bar";
import { useFieldSelection } from "./use-field-selection";
import { useWorkspace } from "./workspace-state";

/**
 * The right column: the record type, the prompt, the field table (today's Define table, edited in
 * the draft) and the assistant at the bottom. The table is the only part that scrolls.
 */
export function FieldColumn({ definition }: { definition: ExtractionDefinitionState }) {
  const { draft, saved, setDraft, errors, showErrors } = definition;
  const { selectedTypeId, selectedFieldId } = useWorkspace();
  const selection = useFieldSelection();
  // Said to screen readers when the bar that held Keep all and Discard all has gone.
  const [decision, setDecision] = useState("");

  // The dots match the highlights, which are coloured by the saved fields; a field not saved yet takes its place in the draft.
  const savedLabels = useMemo(() => fieldLabels(saved ?? { recordTypes: [] }), [saved]);
  const draftLabels = useMemo(() => fieldLabels(draft ?? { recordTypes: [] }), [draft]);
  if (!draft) return null;
  const type = draft.recordTypes.find((t) => t.id === selectedTypeId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordTypeBar definition={definition} />
      <PromptLine definition={definition} />
      <div className="min-h-0 flex-1 overflow-y-auto">
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
        {!type ? (
          <p className="px-4 py-4 text-ink-muted">No fields yet.</p>
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
            onChange={(fieldId, patch) => setDraft((d) => updateField(d, type.id, fieldId, patch))}
            onRemove={(fieldId) => setDraft((d) => removeField(d, type.id, fieldId))}
            onMove={(fieldId, delta) => setDraft((d) => moveField(d, type.id, fieldId, delta))}
            colourDot={(fieldId) => (savedLabels.get(fieldId) ?? draftLabels.get(fieldId))!.style}
            descriptionUnderName
            selectedFieldId={selectedFieldId}
            onRowSelect={selection.toggle}
            afterRow={(field) => (
              <ProposalLines field={field} definition={definition} onDecided={setDecision} />
            )}
            extraRows={
              <ProposedFieldRows typeId={type.id} definition={definition} onDecided={setDecision} />
            }
          />
        )}
        {/* A record type the proposal adds, also while there is no record type yet. */}
        <ProposedTypes definition={definition} onDecided={setDecision} />
      </div>
      <p role="status" className="sr-only">
        {decision}
      </p>
      <AssistantDock definition={definition} />
    </div>
  );
}
