import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fieldFacts } from "./read-only-facts";

describe("fieldFacts", () => {
  test("says the type in words", () => {
    assert.equal(fieldFacts({ valueType: "date", mode: "inferred", multiple: false }), "Date");
  });

  test("adds Exact quote and Several values where they apply", () => {
    assert.equal(
      fieldFacts({ valueType: "text", mode: "quote", multiple: true }),
      "Text · Exact quote · Several values",
    );
    assert.equal(
      fieldFacts({ valueType: "choice", mode: "inferred", multiple: true }),
      "Choice · Several values",
    );
  });
});
