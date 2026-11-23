import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AssistantMessage, StageCell } from "@/services/contracts";
import type { PipelineState } from "@/store/types";
import { shouldPoll, somethingInProgress } from "./catch-up";

const cell = (status: StageCell["status"]): StageCell => ({
  fileId: "f",
  stage: "extract",
  status,
  executionId: "e",
  progress: null,
  error: null,
  output: null,
  updatedAt: "2026-11-23T10:00:00Z",
});
const userMessage: AssistantMessage = {
  id: "u",
  role: "user",
  text: "hi",
  proposal: null,
  status: "done",
  createdAt: "2026-11-23T10:00:00Z",
};
const idle: Pick<PipelineState, "cells" | "startingStages" | "assistantMessages"> = {
  cells: {},
  startingStages: [],
  assistantMessages: [],
};

describe("something in progress", () => {
  test("nothing", () => assert.equal(somethingInProgress(idle), false));
  test("a stage that is starting, queued or running", () => {
    assert.equal(somethingInProgress({ ...idle, startingStages: ["extract"] }), true);
    assert.equal(somethingInProgress({ ...idle, cells: { f: { extract: cell("queued") } } }), true);
    assert.equal(
      somethingInProgress({ ...idle, cells: { f: { extract: cell("running") } } }),
      true,
    );
    assert.equal(
      somethingInProgress({ ...idle, cells: { f: { extract: cell("succeeded") } } }),
      false,
    );
  });
  test("a reply that is awaited", () => {
    assert.equal(somethingInProgress({ ...idle, assistantMessages: [userMessage] }), true);
  });
});

describe("shouldPoll", () => {
  const busy = { ...idle, assistantMessages: [userMessage] };
  test("only while the socket is down and something is in progress", () => {
    assert.equal(shouldPoll({ ...busy, connection: "reconnecting" }), true);
    assert.equal(shouldPoll({ ...busy, connection: "closed" }), true);
    assert.equal(shouldPoll({ ...idle, connection: "closed" }), false);
  });
  test("never while the socket is open, or not yet or no longer in use", () => {
    for (const connection of ["open", "connecting", "idle"] as const) {
      assert.equal(shouldPoll({ ...busy, connection }), false);
    }
  });
});

describe("watchCatchUp", () => {
  test("rounds run only while polling is wanted, one at a time, and stop on cleanup", async () => {
    const { createStore } = await import("zustand/vanilla");
    const { watchCatchUp } = await import("./catch-up");
    const store = createStore<
      Pick<PipelineState, "connection" | "cells" | "startingStages" | "assistantMessages">
    >(() => ({
      connection: "open",
      cells: {},
      startingStages: [],
      assistantMessages: [userMessage],
    }));
    let rounds = 0;
    const stop = watchCatchUp(
      store as never,
      async () => {
        rounds++;
      },
      5,
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(rounds, 0, "the socket is open: no polling");
    store.setState({ connection: "reconnecting" });
    await new Promise((r) => setTimeout(r, 40));
    assert.ok(rounds >= 3, `polled while down and waiting (${rounds})`);
    store.setState({ assistantMessages: [] });
    await new Promise((r) => setTimeout(r, 10));
    const after = rounds;
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(rounds, after, "nothing in progress: stopped");
    store.setState({ assistantMessages: [userMessage] });
    stop();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(rounds, after, "stopped for good after cleanup");
  });
});
