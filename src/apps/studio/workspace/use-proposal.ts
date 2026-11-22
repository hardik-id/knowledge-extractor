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
  /** For an offer: run by "Keep all" in place of putting the definition into the draft. */
  onKeepAll?: () => void;
}

/**
 * A proposal that does not come from the assistant: a template chosen on the start screen. It is
 * shown in the table like the assistant's, until it is kept, discarded or taken back.
 */
export interface ProposalOffer {
  /** Stands where a message id stands; make it unlike one ("template:adr"). */
  id: string;
  proposal: AssistantProposal;
  /** Run by "Keep all" in place of putting the definition into the draft (a template also sets the save note). */
  onKeepAll?: () => void;
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

let offer: ProposalOffer | null = null;

/** Shows `next` in the table as suggestions; null takes the offer back. One offer at a time. */
export function offerProposal(next: ProposalOffer | null) {
  if (offer === next) return;
  offer = next;
  listeners.forEach((l) => l());
}

/** The offer now. */
export function currentOffer() {
  return offer;
}

function useOffer(): ProposalOffer | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => offer,
    () => offer,
  );
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
  const offered = useOffer();
  const latestId = [...messages].reverse().find((m) => m.proposal)?.id;

  // An offer stands until the assistant proposes something newer: the newest suggestion is the one shown.
  const latestAtOffer = useRef<string | undefined>(undefined);
  const seenOffer = useRef<ProposalOffer | null>(null);
  useEffect(() => {
    if (offered !== seenOffer.current) {
      seenOffer.current = offered;
      latestAtOffer.current = latestId;
    } else if (offered && latestId !== latestAtOffer.current) {
      offerProposal(null);
    }
  }, [offered, latestId]);

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
    if (offered && draft) {
      const changes = proposalChanges(draft, offered.proposal.definition);
      if (changes.length > 0)
        return {
          messageId: offered.id,
          proposal: offered.proposal,
          changes,
          current: draft,
          onKeepAll: offered.onKeepAll,
        };
    }
    const message = messages.find((m) => m.id === latestId);
    if (!message?.proposal || !draft || (decided[message.id] ?? "open") !== "open") return null;
    const changes = proposalChanges(draft, message.proposal.definition);
    return changes.length === 0
      ? null
      : { messageId: message.id, proposal: message.proposal, changes, current: draft };
  }, [messages, latestId, draft, decided, offered]);

  useEffect(() => {
    put.current(info);
  }, [info]);
  useEffect(() => () => put.current(null), []);

  return outcomeOf;
}

/** What became of the proposal shown: an offer is over, a message's proposal remembers its outcome. */
function decide(id: string, outcome: ProposalOutcome) {
  if (offer?.id === id) offerProposal(null);
  else setOutcome(id, outcome);
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
      if (info.onKeepAll) info.onKeepAll();
      else definition.setDraft(info.proposal.definition);
      decide(info.messageId, "applied");
      onDecided?.(
        `Kept ${info.changes.length} ${info.changes.length === 1 ? "change" : "changes"}`,
      );
      focusAssistantInput();
    },
    discardAll: () => {
      if (!info) return;
      decide(info.messageId, "dismissed");
      onDecided?.(
        `Discarded ${info.changes.length} ${info.changes.length === 1 ? "change" : "changes"}`,
      );
      focusAssistantInput();
    },
  };
}
