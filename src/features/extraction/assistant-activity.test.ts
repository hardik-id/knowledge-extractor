import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AssistantMessage } from "@/services/contracts";
import {
  AWAITED_EXPIRY_MS,
  assistantActivity,
  createAwaitedTracker,
  mergeAssistantMessages,
} from "./assistant-activity";

let n = 0;
function msg(over: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: `m${++n}`,
    role: "assistant",
    text: "",
    proposal: null,
    status: "done",
    createdAt: "2026-11-23T10:00:00Z",
    ...over,
  };
}
const user = (over: Partial<AssistantMessage> = {}) => msg({ role: "user", text: "hi", ...over });

describe("assistantActivity", () => {
  test("idle with no messages, or when the last message is a finished reply", () => {
    assert.equal(assistantActivity([]), "idle");
    assert.equal(assistantActivity([user(), msg({ text: "ok" })]), "idle");
  });

  test("awaited while the person's message has no reply after it", () => {
    assert.equal(assistantActivity([user()]), "awaited");
    assert.equal(assistantActivity([user(), msg({ text: "ok" }), user()]), "awaited");
  });

  test("awaited and expired is idle, but a send in flight is still working", () => {
    assert.equal(assistantActivity([user()], false, true), "idle");
    assert.equal(assistantActivity([user()], true, true), "working");
  });

  test("working while a send is on its way", () => {
    assert.equal(assistantActivity([], true), "working");
  });

  test("working while the reply exists but has no text and no proposal", () => {
    assert.equal(assistantActivity([user(), msg({ status: "streaming" })]), "working");
  });

  test("writing once text or a proposal has arrived", () => {
    assert.equal(assistantActivity([user(), msg({ status: "streaming", text: "I" })]), "writing");
    const proposal = { definition: { prompt: "", recordTypes: [] } } as never;
    assert.equal(assistantActivity([user(), msg({ status: "streaming", proposal })]), "writing");
  });

  test("idle again when the reply ended, even empty", () => {
    assert.equal(assistantActivity([user(), msg({ status: "done", text: "" })]), "idle");
  });
});

describe("createAwaitedTracker", () => {
  test("expires after the wait, counted from the first sight of that message id", () => {
    let t = 1000;
    const tracker = createAwaitedTracker(() => t);
    const first = [user({ id: "a" })];
    assert.equal(tracker.expired(first), false);
    t += AWAITED_EXPIRY_MS - 1;
    assert.equal(tracker.expired(first), false);
    t += 1;
    assert.equal(tracker.expired(first), true);
    // A new message starts a new wait; a reply ends it.
    assert.equal(tracker.expired([user({ id: "b" })]), false);
    assert.equal(tracker.expired([user({ id: "b" }), msg({})]), false);
  });
});

describe("mergeAssistantMessages", () => {
  test("a reply done here stays done when the server still says streaming", () => {
    const done = msg({ id: "r", text: "all", status: "done" });
    const merged = mergeAssistantMessages([done], [{ ...done, status: "streaming", text: "al" }]);
    assert.equal(merged[0].status, "done");
  });

  test("the server's ending wins, and a message only known here is kept", () => {
    const streaming = msg({ id: "r", text: "al", status: "streaming" });
    const fresh = user({ id: "u" });
    const merged = mergeAssistantMessages(
      [streaming, fresh],
      [{ ...streaming, text: "all", status: "done" }],
    );
    assert.deepEqual(
      merged.map((m) => [m.id, m.status]),
      [
        ["r", "done"],
        ["u", "done"],
      ],
    );
  });

  test("both streaming: the longer local text wins over an older fetched copy", () => {
    const local = msg({ id: "r", text: "hello wor", status: "streaming" });
    const merged = mergeAssistantMessages([local], [{ ...local, text: "hello" }]);
    assert.equal(merged[0].text, "hello wor");
  });

  test("both streaming: a local proposal wins when the fetched copy has none", () => {
    const proposal = { definition: { prompt: "", recordTypes: [] } } as never;
    const local = msg({ id: "r", text: "a", status: "streaming", proposal });
    const merged = mergeAssistantMessages([local], [{ ...local, proposal: null }]);
    assert.ok(merged[0].proposal);
  });

  test("both streaming: the fetched copy wins when it is as long or longer", () => {
    const local = msg({ id: "r", text: "he", status: "streaming" });
    assert.equal(mergeAssistantMessages([local], [{ ...local, text: "hello" }])[0].text, "hello");
    assert.equal(mergeAssistantMessages([local], [{ ...local }])[0].text, "he");
  });
});
