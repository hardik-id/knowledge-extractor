import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Element, Root } from "hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { splitFrontMatter } from "./front-matter";
import { rehypeHighlights, type HighlightMark } from "./rehype-highlights";
import type { Mark } from "./text-spans";

async function render(
  document: string,
  marks: Mark<HighlightMark>[],
  chips?: boolean,
): Promise<Root> {
  const { body } = splitFrontMatter(document);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlights, { marks, body, bodyOffset: document.length - body.length, chips });
  return processor.run(processor.parse(body)) as Promise<Root>;
}

function textOf(node: Element): string {
  return node.children
    .map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : ""))
    .join("");
}

/** Every text span in document order: [start, map, text]. */
function spans(tree: Root): [string, string | undefined, string][] {
  const out: [string, string | undefined, string][] = [];
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.properties["data-text-start"] !== undefined) {
        const map = child.properties["data-text-map"];
        out.push([
          String(child.properties["data-text-start"]),
          map === undefined ? undefined : String(map),
          textOf(child),
        ]);
      } else visit(child);
    }
  };
  visit(tree);
  return out;
}

/** Marked pieces in document order: [ids, chips, text]. */
function marked(tree: Root): [string, string, string][] {
  const out: [string, string, string][] = [];
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "mark") {
        const text = textOf(child);
        out.push([
          String(child.properties["data-marks"]),
          String(child.properties["data-chips"]),
          text,
        ]);
      } else visit(child);
    }
  };
  visit(tree);
  return out;
}

const markOf = (doc: string, text: string, id: string): Mark<HighlightMark> => {
  const start = doc.indexOf(text);
  assert.notEqual(start, -1);
  return { start, end: start + text.length, data: { id } };
};

describe("rehypeHighlights", () => {
  test("paints a plain phrase and leaves the rest", async () => {
    const doc = "Status: Accepted today.\n";
    const tree = await render(doc, [markOf(doc, "Accepted", "a")]);
    assert.deepEqual(marked(tree), [["a", "a", "Accepted"]]);
  });

  test("accounts for the front matter", async () => {
    const doc = "---\ntitle: Accepted\n---\n\nStatus: Accepted.\n";
    const start = doc.lastIndexOf("Accepted");
    const tree = await render(doc, [{ start, end: start + 8, data: { id: "a" } }]);
    assert.deepEqual(marked(tree), [["a", "a", "Accepted"]]);
  });

  test("paints a mark across bold text and chips only the first piece", async () => {
    const doc = "We decided to **use Postgres** for storage.\n";
    const start = doc.indexOf("decided");
    const end = doc.indexOf("Postgres") + "Postgres".length;
    const tree = await render(doc, [{ start, end, data: { id: "m" } }]);
    assert.deepEqual(marked(tree), [
      ["m", "m", "decided to "],
      ["m", "", "use Postgres"],
    ]);
  });

  test("paints a mark across list items", async () => {
    const doc = "- one\n- two\n- three\n";
    const start = doc.indexOf("two");
    const end = doc.indexOf("three") + 5;
    const tree = await render(doc, [{ start, end, data: { id: "m" } }]);
    assert.deepEqual(marked(tree), [
      ["m", "m", "two"],
      ["m", "", "three"],
    ]);
  });

  test("lines up through entities, escapes and inline code", async () => {
    const doc = "Fish &amp; chips \\* and `code here` end\n";
    const tree = await render(doc, [markOf(doc, "chips", "a"), markOf(doc, "code here", "b")]);
    assert.deepEqual(marked(tree), [
      ["a", "a", "chips"],
      ["b", "b", "code here"],
    ]);
  });

  test("overlapping marks list all ids", async () => {
    const doc = "alpha beta gamma\n";
    const tree = await render(doc, [
      { start: 0, end: 16, data: { id: "outer" } },
      markOf(doc, "beta", "inner"),
    ]);
    assert.deepEqual(marked(tree), [
      ["outer", "outer", "alpha "],
      ["outer inner", "inner", "beta"],
      ["outer", "", " gamma"],
    ]);
  });

  test("no marks leaves the tree alone", async () => {
    const tree = await render("Hello\n", []);
    assert.deepEqual(marked(tree), []);
  });

  test("every piece of text, marked or not, says where it starts", async () => {
    const doc = "---\ntitle: x\n---\n\nStatus: Accepted today.\n";
    const at = doc.indexOf("Accepted");
    const tree = await render(doc, [{ start: at, end: at + 8, data: { id: "a" } }]);
    const base = doc.indexOf("Status");
    assert.deepEqual(spans(tree), [
      [String(base), undefined, "Status: "],
      [String(at), undefined, "Accepted"],
      [String(at + 8), undefined, " today."],
    ]);
  });

  test("text spans work with no marks at all", async () => {
    const tree = await render("Hello **world**\n", []);
    assert.deepEqual(spans(tree), [
      ["0", undefined, "Hello "],
      ["8", undefined, "world"],
    ]);
  });

  test("a text span carries a map where rendered and source differ", async () => {
    const doc = "a &amp; b\n";
    const tree = await render(doc, []);
    const [[start, map, text]] = spans(tree);
    assert.equal(start, "0");
    assert.equal(text, "a & b");
    // a, space, & (5 source characters), space, b, end
    assert.equal(map, "0,1,2,7,8,9");
  });

  test("has no chips attribute when chips is off, and keeps the marks", async () => {
    const doc = "We decided to **use Postgres** for storage.\n";
    const start = doc.indexOf("decided");
    const end = doc.indexOf("Postgres") + "Postgres".length;
    const tree = await render(doc, [{ start, end, data: { id: "m" } }], false);
    assert.deepEqual(marked(tree), [
      ["m", "undefined", "decided to "],
      ["m", "undefined", "use Postgres"],
    ]);
  });
});
