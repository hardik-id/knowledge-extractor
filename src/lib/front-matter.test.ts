import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { splitFrontMatter } from "./front-matter";

describe("splitFrontMatter", () => {
  test("no front matter", () => {
    const r = splitFrontMatter("# Title\n\ntext");
    assert.deepEqual(r, { data: null, raw: null, body: "# Title\n\ntext" });
  });

  test("normal block", () => {
    const r = splitFrontMatter('---\ntopic: "HR"\nn: 3\n---\n\n# Hi\n');
    assert.deepEqual(r.data, { topic: "HR", n: 3 });
    assert.equal(r.raw, 'topic: "HR"\nn: 3');
    assert.equal(r.body, "\n# Hi\n");
  });

  test("empty block", () => {
    const r = splitFrontMatter("---\n---\nbody");
    assert.equal(r.data, null);
    assert.equal(r.raw, "");
    assert.equal(r.body, "body");
  });

  test("CRLF line endings", () => {
    const r = splitFrontMatter("---\r\na: 1\r\nb: x\r\n---\r\n# T");
    assert.deepEqual(r.data, { a: 1, b: "x" });
    assert.equal(r.body, "# T");
  });

  test("leading BOM", () => {
    const r = splitFrontMatter("﻿---\na: 1\n---\nbody");
    assert.deepEqual(r.data, { a: 1 });
    assert.equal(r.body, "body");
  });

  test("closes with ... too", () => {
    const r = splitFrontMatter("---\na: 1\n...\nbody");
    assert.deepEqual(r.data, { a: 1 });
    assert.equal(r.body, "body");
  });

  test("invalid YAML keeps raw and strips the block", () => {
    const r = splitFrontMatter("---\na: [1, 2\nb: : :\n---\nbody");
    assert.equal(r.data, null);
    assert.equal(r.raw, "a: [1, 2\nb: : :");
    assert.equal(r.body, "body");
  });

  test("scalar is not a mapping", () => {
    const r = splitFrontMatter("---\njust text\n---\nbody");
    assert.equal(r.data, null);
    assert.equal(r.raw, "just text");
    assert.equal(r.body, "body");
  });

  test("list is not a mapping", () => {
    const r = splitFrontMatter("---\n- a\n- b\n---\nbody");
    assert.equal(r.data, null);
    assert.equal(r.raw, "- a\n- b");
  });

  test("unclosed block is not front matter", () => {
    const text = "---\na: 1\n\n# Title";
    assert.deepEqual(splitFrontMatter(text), { data: null, raw: null, body: text });
  });

  test("a rule later in the document is left alone", () => {
    const text = "# Title\n\n---\n\nmore\n---\n";
    assert.deepEqual(splitFrontMatter(text), { data: null, raw: null, body: text });
  });

  test("a rule in the body after a block is kept", () => {
    const r = splitFrontMatter("---\na: 1\n---\ntext\n\n---\n\nmore");
    assert.deepEqual(r.data, { a: 1 });
    assert.equal(r.body, "text\n\n---\n\nmore");
  });

  test("folded scalar and nested list values", () => {
    const r = splitFrontMatter(
      "---\nsummary: >\n  Line one\n  line two.\nkeywords:\n  - leave\n  - approval\nrelated:\n  - name: a\n    tags: [x, y]\n---\nbody",
    );
    assert.deepEqual(r.data, {
      summary: "Line one line two.\n",
      keywords: ["leave", "approval"],
      related: [{ name: "a", tags: ["x", "y"] }],
    });
  });
});
