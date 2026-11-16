import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  codePointToIndex,
  indexToCodePoint,
  locateSpan,
  segmentText,
  spanFromRange,
} from "./text-spans";

describe("code point conversion", () => {
  test("ASCII is the identity and clamps", () => {
    assert.equal(codePointToIndex("hello", 3), 3);
    assert.equal(codePointToIndex("hello", -2), 0);
    assert.equal(codePointToIndex("hello", 99), 5);
    assert.equal(indexToCodePoint("hello", 3), 3);
    assert.equal(indexToCodePoint("hello", 99), 5);
  });

  test("emoji before, inside and after a span", () => {
    const text = "a😀b😀😀c"; // code points: a 😀 b 😀 😀 c = 6
    assert.equal(text.length, 9);
    assert.equal(codePointToIndex(text, 0), 0);
    assert.equal(codePointToIndex(text, 1), 1);
    assert.equal(codePointToIndex(text, 2), 3);
    assert.equal(codePointToIndex(text, 3), 4);
    assert.equal(codePointToIndex(text, 4), 6);
    assert.equal(codePointToIndex(text, 5), 8);
    assert.equal(codePointToIndex(text, 6), 9);
    assert.equal(codePointToIndex(text, 7), 9);
    for (let cp = 0; cp <= 6; cp++) {
      assert.equal(indexToCodePoint(text, codePointToIndex(text, cp)), cp);
    }
  });

  test("an index inside a surrogate pair counts as its start", () => {
    const text = "a😀b";
    assert.equal(indexToCodePoint(text, 1), 1);
    assert.equal(indexToCodePoint(text, 2), 1);
    assert.equal(indexToCodePoint(text, 3), 2);
    assert.equal(indexToCodePoint(text, 4), 3);
  });

  test("combining accents are separate code points", () => {
    const text = "éx"; // e + combining acute + x
    assert.equal(codePointToIndex(text, 2), 2);
    assert.equal(indexToCodePoint(text, 3), 3);
  });

  test("the cache follows a change of text", () => {
    assert.equal(codePointToIndex("😀😀", 1), 2);
    assert.equal(codePointToIndex("abcd", 1), 1);
    assert.equal(codePointToIndex("😀😀", 2), 4);
  });
});

describe("locateSpan", () => {
  test("exact offsets", () => {
    const text = "Status: Accepted";
    assert.deepEqual(locateSpan(text, { start: 8, end: 16, quote: "Accepted" }), {
      start: 8,
      end: 16,
    });
  });

  test("offsets are code points", () => {
    const text = "😀 Status: Accepted";
    assert.deepEqual(locateSpan(text, { start: 10, end: 18, quote: "Accepted" }), {
      start: 11,
      end: 19,
    });
  });

  test("shifted offsets after the text gained a prefix", () => {
    const text = "NEW PREFIX Status: Accepted";
    assert.deepEqual(locateSpan(text, { start: 8, end: 16, quote: "Accepted" }), {
      start: 19,
      end: 27,
    });
  });

  test("a quote occurring twice: the nearest wins", () => {
    const text = "yes no yes no yes";
    assert.deepEqual(locateSpan(text, { start: 0, end: 3, quote: "yes" }), { start: 0, end: 3 });
    assert.deepEqual(locateSpan(text, { start: 6, end: 9, quote: "yes" }), { start: 7, end: 10 });
    // offsets 9 is nearer the 2nd (7) than the 3rd (14)
    assert.deepEqual(locateSpan(text, { start: 9, end: 12, quote: "yes" }), { start: 7, end: 10 });
    assert.deepEqual(locateSpan(text, { start: 40, end: 43, quote: "yes" }), {
      start: 14,
      end: 17,
    });
  });

  test("a missing or empty quote", () => {
    assert.equal(locateSpan("abc", { start: 0, end: 1, quote: "zzz" }), null);
    assert.equal(locateSpan("abc", { start: 0, end: 0, quote: "" }), null);
  });
});

describe("spanFromRange", () => {
  test("round-trips through locateSpan", () => {
    const text = "x😀 hello 😀 world";
    const span = spanFromRange(text, 4, 9);
    assert.equal(span.quote, "hello");
    assert.deepEqual(locateSpan(text, span), { start: 4, end: 9 });
  });

  test("orders and clamps", () => {
    const span = spanFromRange("abcdef", 99, 2);
    assert.deepEqual(span, { start: 2, end: 6, quote: "cdef" });
    assert.deepEqual(spanFromRange("abc", -5, 1), { start: 0, end: 1, quote: "a" });
  });

  test("never splits a surrogate pair", () => {
    const text = "a😀b"; // indices: a0 high1 low2 b3
    const span = spanFromRange(text, 2, 2);
    assert.deepEqual(span, { start: 1, end: 2, quote: "😀" });
    const wide = spanFromRange(text, 2, 3);
    assert.equal(wide.quote, "😀");
    assert.deepEqual(spanFromRange(text, 0, 2), { start: 0, end: 2, quote: "a😀" });
  });
});

describe("segmentText", () => {
  const join = (segments: { text: string }[]) => segments.map((s) => s.text).join("");

  test("no marks: one unmarked piece", () => {
    assert.deepEqual(segmentText("hello", []), [{ start: 0, end: 5, text: "hello", marks: [] }]);
    assert.deepEqual(segmentText("", []), []);
  });

  test("adjacent marks", () => {
    const s = segmentText("abcdef", [
      { start: 0, end: 3, data: "A" },
      { start: 3, end: 6, data: "B" },
    ]);
    assert.deepEqual(
      s.map((x) => [x.text, x.marks]),
      [
        ["abc", ["A"]],
        ["def", ["B"]],
      ],
    );
  });

  test("overlapping marks", () => {
    const s = segmentText("abcdef", [
      { start: 0, end: 4, data: "A" },
      { start: 2, end: 6, data: "B" },
    ]);
    assert.deepEqual(
      s.map((x) => [x.text, x.marks]),
      [
        ["ab", ["A"]],
        ["cd", ["A", "B"]],
        ["ef", ["B"]],
      ],
    );
  });

  test("nested marks, with unmarked text around", () => {
    const s = segmentText("0123456789", [
      { start: 2, end: 8, data: "outer" },
      { start: 4, end: 6, data: "inner" },
    ]);
    assert.deepEqual(
      s.map((x) => [x.text, x.marks]),
      [
        ["01", []],
        ["23", ["outer"]],
        ["45", ["outer", "inner"]],
        ["67", ["outer"]],
        ["89", []],
      ],
    );
  });

  test("identical marks share one piece, in input order", () => {
    const s = segmentText("abc", [
      { start: 1, end: 2, data: "x" },
      { start: 1, end: 2, data: "y" },
    ]);
    assert.deepEqual(s[1].marks, ["x", "y"]);
    assert.equal(s.length, 3);
  });

  test("clipped, empty and out-of-range marks", () => {
    const s = segmentText("abcdef", [
      { start: -5, end: 2, data: "head" },
      { start: 4, end: 99, data: "tail" },
      { start: 3, end: 3, data: "empty" },
      { start: 50, end: 60, data: "away" },
      { start: 5, end: 2, data: "backwards" },
    ]);
    assert.deepEqual(
      s.map((x) => [x.text, x.marks]),
      [
        ["ab", ["head"]],
        ["cd", []],
        ["ef", ["tail"]],
      ],
    );
  });

  test("the from/to window", () => {
    const marks = [{ start: 1, end: 7, data: "m" }];
    const s = segmentText("0123456789", marks, 3, 9);
    assert.deepEqual(
      s.map((x) => [x.start, x.end, x.text, x.marks]),
      [
        [3, 7, "3456", ["m"]],
        [7, 9, "78", []],
      ],
    );
    assert.deepEqual(segmentText("abc", [], 2, 1), []);
  });

  test("pieces concatenate back to the text", () => {
    const text = "The quick 😀 brown fox";
    const marks = [
      { start: 4, end: 9, data: 1 },
      { start: 7, end: 15, data: 2 },
      { start: 0, end: 3, data: 3 },
    ];
    assert.equal(join(segmentText(text, marks)), text);
    assert.equal(join(segmentText(text, marks, 5, 12)), text.slice(5, 12));
  });
});
