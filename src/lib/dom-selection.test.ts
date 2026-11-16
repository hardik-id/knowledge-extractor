import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parsePiece, pieceIndex, rangeBetween, trimRange } from "./dom-selection";

describe("pieceIndex", () => {
  test("adds the offset to the start of a plain piece", () => {
    assert.equal(pieceIndex({ piece: { start: 40, length: 10 }, offset: 3 }), 43);
  });
  test("clamps the offset into the piece", () => {
    assert.equal(pieceIndex({ piece: { start: 40, length: 10 }, offset: 99 }), 50);
    assert.equal(pieceIndex({ piece: { start: 40, length: 10 }, offset: -4 }), 40);
  });
  test("goes through the map when the piece has one", () => {
    const piece = { start: 10, length: 3, map: [10, 11, 16, 17] };
    assert.equal(pieceIndex({ piece, offset: 2 }), 16);
    assert.equal(pieceIndex({ piece, offset: 3 }), 17);
  });
});

describe("parsePiece", () => {
  test("reads the start", () => {
    assert.deepEqual(parsePiece({ start: "12" }, 5), { start: 12, length: 5 });
  });
  test("makes the map absolute", () => {
    assert.deepEqual(parsePiece({ start: "10", map: "0,1,6", approx: "true" }, 2), {
      start: 10,
      length: 2,
      map: [10, 11, 16],
      approx: true,
    });
  });
  test("drops a map of the wrong size", () => {
    assert.deepEqual(parsePiece({ start: "10", map: "0,1" }, 5), { start: 10, length: 5 });
  });
  test("rejects a missing or bad start", () => {
    assert.equal(parsePiece({ start: null }, 5), null);
    assert.equal(parsePiece({ start: "x" }, 5), null);
    assert.equal(parsePiece({ start: "-3" }, 5), null);
  });
});

describe("trimRange", () => {
  test("trims whitespace at both ends", () => {
    const text = "ab  hello world \n";
    assert.deepEqual(trimRange(text, 2, text.length), { start: 4, end: 15 });
  });
  test("orders and clamps", () => {
    assert.deepEqual(trimRange("hello", 9, 1), { start: 1, end: 5 });
  });
  test("gives null for blank or empty ranges", () => {
    assert.equal(trimRange("a   b", 1, 4), null);
    assert.equal(trimRange("abc", 2, 2), null);
  });
});

describe("rangeBetween", () => {
  const text = "# Title\n\nWe store orders in Postgres.\n\nNext paragraph.\n";
  const at = (s: string) => text.indexOf(s);

  test("spans several pieces by their start and end", () => {
    const from = { piece: { start: at("We store"), length: 28 }, offset: 3 };
    const to = { piece: { start: at("Next"), length: 15 }, offset: 4 };
    const range = rangeBetween(text, from, to)!;
    assert.equal(text.slice(range.start, range.end), "store orders in Postgres.\n\nNext");
  });

  test("trims the whitespace a selection picks up", () => {
    const from = { piece: { start: at("We store"), length: 28 }, offset: 27 };
    const to = { piece: { start: at("Next"), length: 15 }, offset: 0 };
    const range = rangeBetween(text, from, to)!;
    assert.equal(text.slice(range.start, range.end), ".");
  });

  test("ignores an empty selection", () => {
    const p = { piece: { start: 3, length: 5 }, offset: 2 };
    assert.equal(rangeBetween(text, p, p), null);
  });

  test("finds the selected text near a guessed alignment", () => {
    const doc = "intro\n\nFish &amp; chips are good.\n";
    const start = doc.indexOf("Fish");
    // The guess is two characters short on both sides.
    const from = { piece: { start: start + 2, length: 10, approx: true }, offset: 0 };
    const to = { piece: { start: start + 2, length: 10, approx: true }, offset: 4 };
    const range = rangeBetween(doc, from, to, "Fish & chips")!;
    assert.equal(range.start >= 0, true);
    // "Fish & chips" is not in the source, so the computed range stays.
    assert.deepEqual(range, { start: start + 2, end: start + 6 });
    const exact = rangeBetween(doc, from, to, "chips are")!;
    assert.equal(doc.slice(exact.start, exact.end), "chips are");
  });
});
