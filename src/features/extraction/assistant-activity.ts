import type { AssistantMessage } from "@/services/contracts";

/**
 * What the conversation is doing, from its messages alone:
 * - awaited: the last message is the person's and no reply is known yet (it may never come);
 * - working: a send is on its way, or the reply exists but is still empty;
 * - writing: the reply is streaming text or a proposal;
 * - idle: nothing is awaited.
 * Only working and writing lock the input; awaited just shows a line.
 */
export type AssistantActivity = "idle" | "awaited" | "working" | "writing";

/** How long a reply is awaited, on this page's clock, before the wait is given up on. The server
 * closes a stale reply after 300 s when it is asked. */
export const AWAITED_EXPIRY_MS = 330_000;

/** The id of the person's message that is awaiting a reply, or null. */
export function awaitedMessageId(messages: readonly AssistantMessage[]): string | null {
  const last = messages[messages.length - 1];
  return last && last.role === "user" ? last.id : null;
}

/** `awaitedExpired`: the awaited state has lasted too long, so it counts as idle. */
export function assistantActivity(
  messages: readonly AssistantMessage[],
  sending = false,
  awaitedExpired = false,
): AssistantActivity {
  if (sending) return "working";
  const last = messages[messages.length - 1];
  if (!last) return "idle";
  if (last.role === "user") return awaitedExpired ? "idle" : "awaited";
  if (last.status !== "streaming") return "idle";
  return last.text === "" && !last.proposal ? "working" : "writing";
}

/**
 * Remembers, on a local monotonic clock, when this page first saw a message awaiting a reply, so
 * the wait can expire without comparing client and server clocks.
 */
export function createAwaitedTracker(now: () => number = () => performance.now()) {
  let id: string | null = null;
  let since = 0;
  return {
    /** Whether the awaited reply of `messages` has been awaited for the whole expiry. */
    expired(messages: readonly AssistantMessage[]): boolean {
      const current = awaitedMessageId(messages);
      if (current !== id) {
        id = current;
        since = now();
      }
      return current !== null && now() - since >= AWAITED_EXPIRY_MS;
    },
  };
}

export type AwaitedTracker = ReturnType<typeof createAwaitedTracker>;

/**
 * The conversation as fetched, joined with what arrived live meanwhile: a reply that is already
 * done here stays done, a streaming one keeps its newer live text, and messages only known here (just sent) are kept.
 */
export function mergeAssistantMessages(
  local: readonly AssistantMessage[],
  loaded: readonly AssistantMessage[],
): AssistantMessage[] {
  const byId = new Map(local.map((m) => [m.id, m]));
  const merged = loaded.map((m) => {
    const mine = byId.get(m.id);
    if (!mine) return m;
    if (m.status !== "streaming") return m;
    if (mine.status === "done") return mine;
    // Both still streaming: the local copy may be newer than the fetched one.
    if (mine.status === "streaming") {
      if (mine.text.length > m.text.length || (mine.proposal && !m.proposal)) return mine;
    }
    return m;
  });
  const known = new Set(loaded.map((m) => m.id));
  return [...merged, ...local.filter((m) => !known.has(m.id))];
}
