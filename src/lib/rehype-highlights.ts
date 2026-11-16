import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import { alignToSource } from "./markdown-offsets";
import { segmentText, type Mark } from "./text-spans";

/**
 * A rehype plugin that paints marks over rendered Markdown.
 *
 * The marks live in string indices of the FULL document (front matter
 * included). The tree comes from the Markdown BODY, so `bodyOffset` is where
 * the body starts in the document. Every text node that knows its position is
 * lined up with the source (see markdown-offsets), cut at the mark boundaries
 * and replaced by plain text and `<mark>` elements:
 *
 *   <mark data-marks="id1 id2" data-chips="id1">text</mark>
 *
 * `data-marks` lists every mark covering the piece. `data-chips` lists those
 * that show up for the first time in document order, so a mark that runs over
 * several text nodes (bold inside a paragraph, several list items) is painted
 * in each of them but carries its name chip only once.
 */

export interface HighlightMark {
  id: string;
}

export interface RehypeHighlightsOptions {
  marks: Mark<HighlightMark>[];
  /** The Markdown body the tree was parsed from. */
  body: string;
  /** Where the body starts in the document the marks refer to. */
  bodyOffset: number;
}

export const MARKS_ATTRIBUTE = "data-marks";
export const CHIPS_ATTRIBUTE = "data-chips";
/** On the span around every piece of text: where the piece starts in the full document (string index). */
export const TEXT_START_ATTRIBUTE = "data-text-start";
/** Only where rendered and source text differ: the source offset (from the start) of each rendered character, plus the end. */
export const TEXT_MAP_ATTRIBUTE = "data-text-map";
/** Set when the alignment with the source was a guess, so a reader should double-check it. */
export const TEXT_APPROX_ATTRIBUTE = "data-text-approx";

export function rehypeHighlights(options: RehypeHighlightsOptions) {
  return (tree: Root): void => {
    const seen = new Set<string>();
    walk(tree, options, seen);
  };
}

function walk(parent: Root | Element, options: RehypeHighlightsOptions, seen: Set<string>): void {
  const next: (ElementContent | RootContent)[] = [];
  for (const child of parent.children as (ElementContent | RootContent)[]) {
    if (child.type === "text") {
      next.push(...cutText(child, options, seen));
    } else {
      if (child.type === "element") walk(child, options, seen);
      next.push(child);
    }
  }
  parent.children = next as typeof parent.children;
}

function cutText(
  node: Text,
  { marks, body, bodyOffset }: RehypeHighlightsOptions,
  seen: Set<string>,
): (Text | Element)[] {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined || node.value === "") return [node];

  const source = body.slice(start, end);
  const map = alignToSource(node.value, source, start + bodyOffset);
  const first = map[0];
  const last = map[map.length - 1];
  // Only marks that touch this node matter.
  const near = marks.filter((m) => m.start < last && m.end > first);

  // Re-express each mark in indices of the rendered text: a character is
  // covered when the source character it came from is inside the mark.
  const local: Mark<HighlightMark>[] = near.map((m) => ({
    start: firstIndexAtOrAfter(map, m.start, node.value.length),
    end: firstIndexAtOrAfter(map, m.end, node.value.length),
    data: m.data,
  }));

  const approx = node.value !== source && map.some((at, i) => i > 0 && at === map[i - 1]);
  const pieces: (Text | Element)[] = [];
  for (const piece of segmentText(node.value, local)) {
    const text = textSpan(piece.text, map, piece.start, piece.end, approx);
    if (piece.marks.length === 0) {
      pieces.push(text);
      continue;
    }
    const ids = piece.marks.map((m) => m.id);
    const chips = ids.filter((id) => !seen.has(id));
    for (const id of chips) seen.add(id);
    pieces.push({
      type: "element",
      tagName: "mark",
      properties: { [MARKS_ATTRIBUTE]: ids.join(" "), [CHIPS_ATTRIBUTE]: chips.join(" ") },
      children: [text],
    });
  }
  return pieces;
}

/** A piece of text in a span that records where it is in the source. */
function textSpan(
  value: string,
  map: number[],
  from: number,
  to: number,
  approx: boolean,
): Element {
  const origin = map[from];
  const properties: Element["properties"] = { [TEXT_START_ATTRIBUTE]: String(origin) };
  let same = true;
  for (let i = from; i <= to && same; i++) same = map[i] - origin === i - from;
  if (!same) {
    properties[TEXT_MAP_ATTRIBUTE] = map
      .slice(from, to + 1)
      .map((at) => at - origin)
      .join(",");
  }
  if (approx) properties[TEXT_APPROX_ATTRIBUTE] = "true";
  return { type: "element", tagName: "span", properties, children: [{ type: "text", value }] };
}

/** The first rendered index whose source position is at or after `position` (`length` if none). */
function firstIndexAtOrAfter(map: number[], position: number, length: number): number {
  for (let i = 0; i < length; i++) if (map[i] >= position) return i;
  return length;
}
