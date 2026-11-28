"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import { useMay } from "@/features/iam/use-may";
import { plural } from "@/lib/format";
import { suggestionLines } from "./suggestion-lines";
import { useProposal } from "./use-proposal";

/**
 * A suggestion in the conversation, under the assistant's message. While it waits: the changes in
 * plain words and "Keep all", "Discard" and "Review" (which opens the table in Configuration).
 * Decided, or on an older message: only the outcome. Names in the lines come from the language
 * model and are shown as text.
 */
export function SuggestionCard({
  definition,
  waiting,
  outcome,
  onDecided,
  onReview,
}: {
  definition: ExtractionDefinitionState;
  /** The suggestion this card shows is the one that waits for a decision. */
  waiting: boolean;
  /** What the conversation says of the suggestion: "Waiting for you", "Kept", "3 kept, 2 discarded". */
  outcome?: { open: boolean; line: string } | null;
  onDecided?: (said: string) => void;
  onReview: () => void;
}) {
  const { info, keepAll, discardAll } = useProposal(definition, onDecided);
  const mayEdit = useMay("workspace.edit");
  const open = waiting && info != null;
  const count = info?.changes.length ?? 0;
  // Without the right to edit a suggestion is only read: no decision, so nothing "waits for" the person.
  const line = outcome && (mayEdit || !outcome.open) ? outcome : null;
  if (!open && !line) return null;
  return (
    <div
      role="group"
      aria-label="Suggestion"
      className="flex max-w-[92%] flex-col gap-2 rounded-panel border border-border-subtle bg-surface-tint px-3 py-2"
    >
      {open && info && (
        <>
          <p className="flex items-center gap-2 font-semibold text-ink-heading">
            <Sparkles aria-hidden className="size-4 shrink-0 text-link" />
            {plural(count, "suggested change")}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-small text-ink">
            {suggestionLines(info.changes, info.current, info.proposal.definition).map(
              (line, i) => (
                <li key={i} className="break-words">
                  {line}
                </li>
              ),
            )}
          </ul>
          {mayEdit && (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Keep all ${plural(count, "suggested change")}`}
                onClick={keepAll}
              >
                Keep all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Discard ${plural(count, "suggested change")}`}
                onClick={discardAll}
              >
                Discard
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Review suggested changes in Configuration"
                onClick={onReview}
              >
                Review
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </>
      )}
      {line && (
        <p
          className={
            line.open ? "text-small font-medium text-warning" : "text-small text-ink-muted"
          }
        >
          {line.line}
        </p>
      )}
    </div>
  );
}
