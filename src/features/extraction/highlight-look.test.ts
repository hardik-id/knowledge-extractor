import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { highlightLook } from "./highlight-look";

const m = (recordId: string, valueId: string, labelIndex: number) => ({
  recordId,
  valueId,
  start: 0,
  end: 3,
  labelIndex,
});
const a = m("r1", "v1", 1);
const b = m("r2", "v2", 2);

describe("highlightLook", () => {
  it("colours a piece when no record is in focus", () => {
    assert.deepEqual(highlightLook([a], null, null), {
      faint: false,
      active: false,
      labelIndex: 1,
    });
  });

  it("colours a piece by its marks of the focused record", () => {
    assert.deepEqual(highlightLook([a, b], "r2", null), {
      faint: false,
      active: false,
      labelIndex: 2,
    });
  });

  it("makes a piece with no mark of the focused record faint", () => {
    assert.equal(highlightLook([b], "r1", null).faint, true);
  });

  it("does not compare by value id", () => {
    assert.equal(highlightLook([b], "v1", null).faint, true);
    assert.equal(highlightLook([a], "v1", null).faint, true);
  });

  it("keeps the colour of a selected value of another record", () => {
    assert.deepEqual(highlightLook([b], "r1", "v2"), { faint: false, active: true, labelIndex: 2 });
  });
});
