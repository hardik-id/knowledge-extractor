import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { currentOutcomes, resetOutcomes, setOutcome } from "./use-proposal";

describe("the outcomes of proposals", () => {
  afterEach(() => resetOutcomes());

  test("remembers what became of each proposal", () => {
    setOutcome("m1", "applied");
    setOutcome("m2", "dismissed");
    assert.deepEqual(currentOutcomes(), { m1: "applied", m2: "dismissed" });
  });

  test("a new outcome does not change the earlier object", () => {
    setOutcome("m1", "applied");
    const before = currentOutcomes();
    setOutcome("m2", "applied");
    assert.deepEqual(before, { m1: "applied" });
  });

  test("clearing the conversation forgets them all", () => {
    setOutcome("m1", "applied");
    resetOutcomes();
    assert.deepEqual(currentOutcomes(), {});
  });
});
