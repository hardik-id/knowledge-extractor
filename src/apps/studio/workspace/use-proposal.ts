"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Draft } from "@/features/extraction/definition-draft";
import {
  proposalChanges,
  shownOutcome,
  type ProposalChange,
  type ProposalOutcome,
} from "@/features/extraction/proposal-diff";
import type { ExtractionDefinitionState } from "@/features/extraction/use-extraction-definition";
import type { AssistantMessage, AssistantProposal } from "@/services/contracts";
import { useWorkspace } from "./workspace-state";

/** The newest proposal still to decide, with what keeping it would change in the draft it was compared with. */
export interface ProposalInfo {
  messageId: string;
  proposal: AssistantProposal;
  changes: ProposalChange[];
  /** The draft the changes are relative to. */
  current: Draft;
}

// What became of each proposal is only remembered on the page. It lives outside the column so
// that closing the sheet (below 1100px) does not make a decided proposal open again.
let outcomes: Record<string, ProposalOutcome> = {};
const listeners = new Set<() => void>();

export function setOutcome(messageId: string, outcome: ProposalOutcome) {
  outcomes = { ...outcomes, [messageId]: outcome };
  listeners.forEach((l) => l());
}

/** The outcomes now (for tests). */
export function currentOutcomes() {
  return outcomes;
}

/** Forgets every outcome: the conversation was cleared. */
export function resetOutcomes() {
  outcomes = {};
  listeners.forEach((l) => l());
}

function useOutcomes(): Record<string, ProposalOutcome> {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => outcomes,
    () => outcomes,
  );
}

/**
 * Run by the assistant dock: finds the newest open proposal among `messages` and puts it into the
 * workspace, where the table reads it. Returns what to say about each message's proposal.
 */
export function useProposalSync(
  draft: Draft | undefined,
  messages: readonly AssistantMessage[],
): (message: AssistantMessage) => ProposalOutcome | "included" {
  const { setProposal } = useWorkspace();
  // The provider makes a new setter with every value; only a new proposal should run the effect.
  const put = useRef(setProposal);
  useEffect(() => {
    put.current = setProposal;
  });
  const decided = useOutcomes();
  const latestId = [...messages].reverse().find((m) => m.proposal)?.id;

  // Worked out once per change of messages, draft or decisions, not on every keystroke in the input.
  const shown = useMemo(() => {
    const map = new Map<string, ProposalOutcome | "included">();
    for (const message of messages) {
      if (!message.proposal) continue;
      const outcome = decided[message.id] ?? (message.id === latestId ? "open" : "replaced");
      map.set(
        message.id,
        outcome !== "open" || !draft
          ? outcome
          : shownOutcome(outcome, proposalChanges(draft, message.proposal.definition).length),
      );
    }
    return map;
  }, [messages, latestId, draft, decided]);
  const outcomeOf = (message: AssistantMessage): ProposalOutcome | "included" =>
    shown.get(message.id) ?? decided[message.id] ?? "replaced";

  const info = useMemo<ProposalInfo | null>(() => {
    const message = messages.find((m) => m.id === latestId);
    if (!message?.proposal || !draft || (decided[message.id] ?? "open") !== "open") return null;
    const changes = proposalChanges(draft, message.proposal.definition);
    return changes.length === 0
      ? null
      : { messageId: message.id, proposal: message.proposal, changes, current: draft };
  }, [messages, latestId, draft, decided]);

  useEffect(() => {
    put.current(info);
  }, [info]);
  useEffect(() => () => put.current(null), []);

  return outcomeOf;
}

/** Puts the cursor in the assistant's input: where focus goes when a control that had it disappears. */
export function focusAssistantInput() {
  document.querySelector<HTMLInputElement>('input[aria-label="Ask the assistant"]')?.focus();
}

/** The open proposal as the table shows it, with keeping and discarding all of it. */
export function useProposal(
  definition: ExtractionDefinitionState,
  onDecided?: (said: string) => void,
): {
  info: ProposalInfo | null;
  keepAll: () => void;
  discardAll: () => void;
} {
  const { proposal } = useWorkspace();
  const info = (proposal as ProposalInfo | null) ?? null;
  return {
    info,
    keepAll: () => {
      if (!info) return;
      definition.setDraft(info.proposal.definition);
      setOutcome(info.messageId, "applied");
      onDecided?.(
        `Kept ${info.changes.length} ${info.changes.length === 1 ? "change" : "changes"}`,
      );
      focusAssistantInput();
    },
    discardAll: () => {
      if (!info) return;
      setOutcome(info.messageId, "dismissed");
      onDecided?.(
        `Discarded ${info.changes.length} ${info.changes.length === 1 ? "change" : "changes"}`,
      );
      focusAssistantInput();
    },
  };
}
