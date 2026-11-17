import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { studioSteps } from "./nav-steps";

describe("studioSteps", () => {
  test("marks the step the path belongs to", () => {
    assert.deepEqual(
      studioSteps("/studio", true).map((s) => s.current),
      [true, false],
    );
    assert.deepEqual(
      studioSteps("/studio/extract", true).map((s) => s.current),
      [false, true],
    );
  });

  test("extraction is disabled, with a reason, until there is a run", () => {
    const [documents, extraction] = studioSteps("/studio", false);
    assert.equal(documents.disabled, false);
    assert.equal(extraction.disabled, true);
    assert.ok(extraction.reason);
    assert.equal(studioSteps("/studio", true)[1].disabled, false);
  });
});
