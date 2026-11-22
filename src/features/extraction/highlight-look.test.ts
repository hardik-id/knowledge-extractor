import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highlightLook } from "./highlight-look";

const m = (fieldId: string, valueId: string, labelIndex: number) => ({
  fieldId,
  valueId,
  start: 0,
  end: 3,
  labelIndex,
});
const a = m("f1", "v1", 1);
const b = m("f2", "v2", 2);

describe("highlightLook", () => {
  it("fades nothing when no field is in focus", () => {
    assert.deepEqual(highlightLook([a], null, null), {
      faded: false,
      active: false,
      labelIndex: 1,
    });
    assert.equal(highlightLook([a], undefined, null).faded, false);
  });

  it("keeps a piece of the focused field at full strength, coloured by that field", () => {
    assert.deepEqual(highlightLook([a, b], "f2", null), {
      faded: false,
      active: false,
      labelIndex: 2,
    });
  });

  it("fades a piece with no mark of the focused field, in its own colour", () => {
    assert.deepEqual(highlightLook([b], "f1", null), { faded: true, active: false, labelIndex: 2 });
  });

  it("does not compare by value id", () => {
    assert.equal(highlightLook([b], "v2", null).faded, true);
  });

  it("keeps a selected value at full strength", () => {
    assert.deepEqual(highlightLook([b], "f1", "v2"), { faded: false, active: true, labelIndex: 2 });
  });
});
