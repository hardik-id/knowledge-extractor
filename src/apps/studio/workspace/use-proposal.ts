"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Draft } from "@/features/extraction/definition-draft";
import {
  applyChange,
  applyChanges,
  changeKey,
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

/** The offer has not yet been seen with the conversation loaded. */
export const NOT_SEEN = null;
/** The id of the assistant's newest proposal when the offer was first seen (undefined: there was none). */
export type OfferBaseline = string | undefined | typeof NOT_SEEN;

/**
 * Whether a standing offer gives way to the assistant, given the assistant's newest proposal now.
 * The newest suggestion is the one shown: a proposal that arrives after the offer replaces it.
 * A conversation that is cleared (no proposal left) replaces nothing.
 */
export function offerStep(
  baseline: OfferBaseline,
  latestId: string | undefined,
): { withdraw: boolean; baseline: OfferBaseline } {
  if (baseline === NOT_SEEN || latestId === undefined)
    return { withdraw: false, baseline: latestId };
  return { withdraw: latestId !== baseline, baseline };
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

/** What was decided one change at a time in a proposal: how many were kept, which were discarded. */
export interface Decision {
  kept: number;
  /** `changeKey` of each discarded change: a change is told apart by what it is, not by its place. */
  discarded: string[];
  /** Decided all at once ("Keep all" or "Discard all" before anything else): the line says "Kept" or "Discarded". */
  whole: boolean;
}
const NONE: Decision = { kept: 0, discarded: [], whole: false };
let decisions: Record<string, Decision> = {};

/** Adds to what is remembered of a proposal's one-by-one decisions. */
export function recordDecision(
  id: string,
  add: { kept?: number; discarded?: readonly string[]; whole?: boolean },
) {
  const before = decisions[id] ?? NONE;
  decisions = {
    ...decisions,
    [id]: {
      kept: before.kept + (add.kept ?? 0),
      discarded: [...before.discarded, ...(add.discarded ?? [])],
      whole: add.whole ?? before.whole,
    },
  };
  listeners.forEach((l) => l());
}

/** The decisions now (for tests). */
export function currentDecisions() {
  return decisions;
}

/** The changes not yet decided: those the person has not discarded. */
export function openChanges(
  changes: readonly ProposalChange[],
  decision: Decision | undefined,
): ProposalChange[] {
  const gone = new Set(decision?.discarded);
  return changes.filter((c) => !gone.has(changeKey(c)));
}

const OUTCOME_LINE = {
  open: "Waiting for you",
  applied: "Kept",
  dismissed: "Discarded",
  replaced: "Replaced",
  included: "Already in what you have",
} as const;

/**
 * What the conversation says of a message's proposal: "Waiting for you", "Kept", "Discarded", or,
 * when the changes were decided one by one, how they went ("1 kept", "2 kept, 1 discarded", and
 * "1 kept, 1 waiting" while some are open).
 */
export function outcomeLine(
  outcome: ProposalOutcome | "included",
  decision: Decision | undefined,
  open: number,
): string {
  const d = decision ?? NONE;
  const counted = (d.kept > 0 || d.discarded.length > 0) && !d.whole;
  if (!counted || outcome === "included" || outcome === "replaced") return OUTCOME_LINE[outcome];
  if (outcome === "dismissed" && d.kept === 0) return OUTCOME_LINE.dismissed;
  if (outcome === "applied" && d.discarded.length === 0) return OUTCOME_LINE.applied;
  const parts = [];
  if (d.kept > 0) parts.push(`${d.kept} kept`);
  if (d.discarded.length > 0) parts.push(`${d.discarded.length} discarded`);
  if (outcome === "open" && open > 0) parts.push(`${open} waiting`);
  return parts.join(", ");
}

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
  decisions = {};
  listeners.forEach((l) => l());
}

let offer: ProposalOffer | null = null;
// The assistant's newest proposal when the offer was first seen with the conversation loaded.
// It lives beside the offer, not in the column, so it outlasts the column closing and opening.
let offerBaseline: OfferBaseline = NOT_SEEN;

/** Shows `next` in the table as suggestions; null takes the offer back. One offer at a time. */
export function offerProposal(next: ProposalOffer | null) {
  if (offer === next) return;
  offer = next;
  // A template offered again starts afresh.
  if (next && decisions[next.id]) {
    decisions = Object.fromEntries(Object.entries(decisions).filter(([id]) => id !== next.id));
  }
  offerBaseline = NOT_SEEN;
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

function useDecisions(): Record<string, Decision> {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => decisions,
    () => decisions,
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
  /** The conversation has loaded: until then an old proposal must not pass for a new one. */
  loaded: boolean,
): (message: AssistantMessage) => { outcome: ProposalOutcome | "included"; line: string } {
  const { setProposal } = useWorkspace();
  // The provider makes a new setter with every value; only a new proposal should run the effect.
  const put = useRef(setProposal);
  useEffect(() => {
    put.current = setProposal;
  });
  const decided = useOutcomes();
  const choices = useDecisions();
  const offered = useOffer();
  const latestId = [...messages].reverse().find((m) => m.proposal)?.id;

  // What keeping the offer would change. Nothing: the draft already has it, and the offer is over.
  const offeredChanges = useMemo(
    () =>
      offered && draft
        ? openChanges(proposalChanges(draft, offered.proposal.definition), choices[offered.id])
        : null,
    [offered, draft, choices],
  );
  // An offer stands until the assistant proposes something newer, or until nothing of it is left.
  useEffect(() => {
    if (!offered) return;
    if (offeredChanges && offeredChanges.length === 0) {
      offerProposal(null);
      return;
    }
    if (!loaded) return;
    const step = offerStep(offerBaseline, latestId);
    offerBaseline = step.baseline;
    if (step.withdraw) offerProposal(null);
  }, [offered, offeredChanges, latestId, loaded]);

  // Worked out once per change of messages, draft or decisions, not on every keystroke in the input.
  const shown = useMemo(() => {
    const map = new Map<string, { outcome: ProposalOutcome | "included"; line: string }>();
    for (const message of messages) {
      if (!message.proposal) continue;
      const decision = choices[message.id];
      const outcome = decided[message.id] ?? (message.id === latestId ? "open" : "replaced");
      const open =
        outcome === "open" && draft
          ? openChanges(proposalChanges(draft, message.proposal.definition), decision).length
          : 0;
      const shownAs = outcome !== "open" || !draft ? outcome : shownOutcome(outcome, open);
      map.set(message.id, { outcome: shownAs, line: outcomeLine(shownAs, decision, open) });
    }
    return map;
  }, [messages, latestId, draft, decided, choices]);
  const outcomeOf = (message: AssistantMessage) => {
    const outcome = decided[message.id] ?? "replaced";
    return shown.get(message.id) ?? { outcome, line: outcomeLine(outcome, choices[message.id], 0) };
  };

  const info = useMemo<ProposalInfo | null>(() => {
    if (offered && draft && offeredChanges && offeredChanges.length > 0)
      return {
        messageId: offered.id,
        proposal: offered.proposal,
        changes: offeredChanges,
        current: draft,
        onKeepAll: offered.onKeepAll,
      };
    // With the offer decided, a proposal of the assistant that still waits shows again.
    const message = messages.find((m) => m.id === latestId);
    if (!message?.proposal || !draft || (decided[message.id] ?? "open") !== "open") return null;
    const changes = openChanges(
      proposalChanges(draft, message.proposal.definition),
      choices[message.id],
    );
    return changes.length === 0
      ? null
      : { messageId: message.id, proposal: message.proposal, changes, current: draft };
  }, [messages, latestId, draft, decided, choices, offered, offeredChanges]);

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

/** The buttons of each open change, in the order of the page. */
const ACTIONS = "[data-change-actions]";

/**
 * Moves the focus to the next open change's first button (the one now at `index`, or the last),
 * or to the assistant's input when none is left. The control that had the focus is gone once the
 * change is decided, and the rows are drawn a frame or two later.
 */
function focusNextChange(index: number, before: number) {
  let frames = 0;
  const step = () => {
    const groups = document.querySelectorAll<HTMLElement>(ACTIONS);
    if (groups.length >= before && frames++ < 20) {
      requestAnimationFrame(step);
      return;
    }
    const next = groups[Math.min(index, groups.length - 1)];
    const button = next?.querySelector<HTMLElement>("button");
    if (button) button.focus();
    else focusAssistantInput();
  };
  requestAnimationFrame(step);
}

/** Where a change's buttons are among all of them, and how many there are. */
function positionOf(el: Element | null) {
  const all = [...document.querySelectorAll(ACTIONS)];
  const group = el?.closest(ACTIONS);
  return { index: Math.max(0, group ? all.indexOf(group) : 0), count: all.length };
}

const count = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;

/** The open proposal as the table shows it, with keeping and discarding it as a whole or one change at a time. */
export function useProposal(
  definition: ExtractionDefinitionState,
  onDecided?: (said: string) => void,
): {
  info: ProposalInfo | null;
  keepAll: () => void;
  discardAll: () => void;
  keep: (change: ProposalChange, from?: Element | null) => void;
  discard: (change: ProposalChange, from?: Element | null) => void;
} {
  const { proposal } = useWorkspace();
  const info = (proposal as ProposalInfo | null) ?? null;
  const choices = useDecisions();
  const decided = info ? (choices[info.messageId] ?? NONE) : NONE;
  const nothingDecided = decided.kept === 0 && decided.discarded.length === 0;

  const one = (change: ProposalChange, from: Element | null | undefined, keeping: boolean) => {
    if (!info) return;
    const { index, count: before } = positionOf(from ?? null);
    const key = changeKey(change);
    const next = keeping
      ? applyChange(info.current, info.proposal.definition, change)
      : info.current;
    if (keeping) {
      definition.setDraft(next);
      recordDecision(info.messageId, { kept: 1 });
    } else {
      recordDecision(info.messageId, { discarded: [key] });
    }
    // Keeping may settle other changes with it (a field turned into a choice brings its values).
    const left = proposalChanges(next, info.proposal.definition).filter((c) => {
      const k = changeKey(c);
      return k !== key && !decided.discarded.includes(k);
    });
    const kept = decided.kept + (keeping ? 1 : 0);
    if (left.length === 0) decide(info.messageId, kept > 0 ? "applied" : "dismissed");
    onDecided?.(keeping ? `Kept: ${change.text}` : `Discarded: ${change.text}`);
    if (left.length === 0) focusAssistantInput();
    else focusNextChange(index, before);
  };

  return {
    info,
    keep: (change, from) => one(change, from, true),
    discard: (change, from) => one(change, from, false),
    keepAll: () => {
      if (!info) return;
      if (info.onKeepAll && nothingDecided) info.onKeepAll();
      else {
        const open = info.changes.filter((c) => !decided.discarded.includes(changeKey(c)));
        definition.setDraft(
          decided.discarded.length === 0
            ? info.proposal.definition
            : applyChanges(info.current, info.proposal.definition, open),
        );
      }
      recordDecision(info.messageId, {
        kept: info.changes.length,
        whole: nothingDecided ? true : undefined,
      });
      decide(info.messageId, "applied");
      onDecided?.(`Kept ${count(info.changes.length)}`);
      focusAssistantInput();
    },
    discardAll: () => {
      if (!info) return;
      recordDecision(info.messageId, {
        discarded: info.changes.map(changeKey),
        whole: nothingDecided ? true : undefined,
      });
      decide(info.messageId, "dismissed");
      onDecided?.(`Discarded ${count(info.changes.length)}`);
      focusAssistantInput();
    },
  };
}
