import type { AssistantMessage } from "@/services/contracts";

/**
 * What the conversation is doing, from its messages alone:
 * - working: a reply is awaited and no text of it has arrived yet (the last message is the
 *   person's, or the reply exists but is still empty);
 * - writing: the reply is streaming text or a proposal;
 * - idle: nothing is awaited.
 * `sending` covers the moment between the click and the API's answer.
 */
export type AssistantActivity = "idle" | "working" | "writing";

export function assistantActivity(
  messages: readonly AssistantMessage[],
  sending = false,
): AssistantActivity {
  if (sending) return "working";
  const last = messages[messages.length - 1];
  if (!last) return "idle";
  if (last.role === "user") return "working";
  if (last.status !== "streaming") return "idle";
  return last.text === "" && !last.proposal ? "working" : "writing";
}

/**
 * The conversation as fetched, joined with what arrived live meanwhile: a reply that is already
 * done here stays done, and messages only known here (just sent) are kept.
 */
export function mergeAssistantMessages(
  local: readonly AssistantMessage[],
  loaded: readonly AssistantMessage[],
): AssistantMessage[] {
  const byId = new Map(local.map((m) => [m.id, m]));
  const merged = loaded.map((m) => {
    const mine = byId.get(m.id);
    return mine && mine.status === "done" && m.status === "streaming" ? mine : m;
  });
  const known = new Set(loaded.map((m) => m.id));
  return [...merged, ...local.filter((m) => !known.has(m.id))];
}
