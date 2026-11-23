import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AssistantMessage } from "@/services/contracts";
import { assistantActivity, mergeAssistantMessages } from "./assistant-activity";

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

  test("working while the person's message has no reply after it", () => {
    assert.equal(assistantActivity([user()]), "working");
    assert.equal(assistantActivity([user(), msg({ text: "ok" }), user()]), "working");
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
});
