import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alignToSource } from "./markdown-offsets";

/** The source text each rendered character maps to, for readable assertions. */
const mapped = (rendered: string, source: string) => {
  const map = alignToSource(rendered, source, 0);
  return [...rendered].map((_, i) => source[map[i]]).join("");
};

describe("alignToSource", () => {
  test("identical text maps one to one, shifted by the start", () => {
    assert.deepEqual(alignToSource("abc", "abc", 10), [10, 11, 12, 13]);
  });

  test("an empty node gives only the end", () => {
    assert.deepEqual(alignToSource("", "", 5), [5]);
  });

  test("inline code skips the backticks", () => {
    assert.deepEqual(alignToSource("code", "`code`", 0), [1, 2, 3, 4, 5]);
  });

  test("a backslash escape is skipped", () => {
    const map = alignToSource("a * b", "a \\* b", 0);
    assert.deepEqual(map, [0, 1, 3, 4, 5, 6]);
  });

  test("a named entity counts as one character, and what follows lines up", () => {
    const source = "Accepted &amp; amended";
    const map = alignToSource("Accepted & amended", source, 0);
    assert.equal(map[9], 9, "the ampersand");
    assert.equal(map[10], 14, "the space after the entity");
    assert.equal(source.slice(map[11], map[18]), "amended");
  });

  test("an entity for another character", () => {
    const source = "a &lt; b";
    const map = alignToSource("a < b", source, 0);
    assert.equal(map[2], 2);
    assert.equal(source.slice(map[3]), " b");
  });

  test("a literal entity-looking text that rendered as written is not skipped", () => {
    assert.equal(mapped("&amp;x", "&amp;x"), "&amp;x");
  });

  test("the map never goes down and has one entry more than the text", () => {
    const rendered = "x & `y` * z";
    const source = "x &amp; \\`y\\` \\* z";
    const map = alignToSource(rendered, source, 100);
    assert.equal(map.length, rendered.length + 1);
    for (let i = 1; i < map.length; i++) assert.ok(map[i] >= map[i - 1]);
    assert.ok(map.at(-1)! <= 100 + source.length);
  });

  test("text that can't be matched is pinned inside the source instead of throwing", () => {
    const map = alignToSource("zzz", "abc", 0);
    assert.equal(map.length, 4);
    assert.ok(map.every((index) => index >= 0 && index <= 3));
  });
});
