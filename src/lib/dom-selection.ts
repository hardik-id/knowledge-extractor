import { codePointToIndex, locateSpan, type IndexRange } from "./text-spans";

/**
 * Turns a selection in the browser into a range of the document's text.
 *
 * Every piece of text on screen sits in an element with `data-text-start`
 * (the index where the piece starts in the full text). Anything else, such as
 * the name chips inside highlights, is not text of the document and is never
 * counted. The arithmetic is in plain functions; `readSelection` is the only
 * part that touches the DOM.
 */

export const TEXT_START = "data-text-start";
export const TEXT_MAP = "data-text-map";
export const TEXT_APPROX = "data-text-approx";

/** One piece of text on screen and how its characters line up with the source. */
export interface TextPiece {
  /** Index in the full text of the piece's first character. */
  start: number;
  /** Characters on screen. */
  length: number;
  /** Source index of each character on screen (and of the end), when the two differ. Same length + 1. */
  map?: number[];
  /** The map is a guess: check it against the selected text. */
  approx?: boolean;
}

export interface Boundary {
  piece: TextPiece;
  /** Characters into the piece (UTF-16 units of the text on screen). */
  offset: number;
}

/** The source index for a position inside a piece. */
export function pieceIndex({ piece, offset }: Boundary): number {
  const at = Math.min(Math.max(Math.floor(offset) || 0, 0), piece.length);
  const mapped = piece.map?.[at];
  return mapped !== undefined ? mapped : piece.start + at;
}

/** Reads a piece from its attributes. Null when there is no usable start. */
export function parsePiece(
  attributes: { start: string | null; map?: string | null; approx?: string | null },
  length: number,
): TextPiece | null {
  if (attributes.start === null || attributes.start === "") return null;
  const origin = Number(attributes.start);
  if (!Number.isInteger(origin) || origin < 0) return null;
  const piece: TextPiece = { start: origin, length };
  if (attributes.map) {
    // Stored relative to the start, to keep the attribute short.
    const offsets = attributes.map.split(",").map(Number);
    if (offsets.length === length + 1 && offsets.every(Number.isFinite)) {
      piece.map = offsets.map((o) => origin + o);
    }
  }
  if (attributes.approx) piece.approx = true;
  return piece;
}

/** A range of the text with whitespace trimmed from both ends, ordered and clamped; null when nothing is left. */
export function trimRange(text: string, start: number, end: number): IndexRange | null {
  let a = Math.min(Math.max(Math.min(start, end), 0), text.length);
  let b = Math.min(Math.max(Math.max(start, end), 0), text.length);
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  return a < b ? { start: a, end: b } : null;
}

/** How far the nearest occurrence of the selected text may be from the computed range, in characters. */
const SLACK = 200;

/**
 * The range of the full text between two boundaries. When either end comes
 * from a guessed alignment and the selected text (`shown`) can be found close
 * by, that occurrence is used instead.
 */
export function rangeBetween(
  text: string,
  from: Boundary,
  to: Boundary,
  shown?: string,
): IndexRange | null {
  const range = trimRange(text, pieceIndex(from), pieceIndex(to));
  if (!range) return null;
  const quote = shown?.trim();
  if (
    (from.piece.approx || to.piece.approx) &&
    quote &&
    text.slice(range.start, range.end) !== quote
  ) {
    const found = locateSpan(text, {
      start: codePointToIndex(text, range.start),
      end: 0,
      quote,
    });
    if (found && Math.abs(found.start - range.start) <= SLACK) return found;
  }
  return range;
}

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ReadSelection {
  range: IndexRange;
  /** Where the end of the selection is on screen (viewport coordinates). */
  rect: Rect;
}

function pieceOf(node: Node | null, root: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  const piece = element?.closest<HTMLElement>(`[${TEXT_START}]`) ?? null;
  return piece && root.contains(piece) ? piece : null;
}

function toPiece(element: HTMLElement): TextPiece | null {
  return parsePiece(
    {
      start: element.getAttribute(TEXT_START),
      map: element.getAttribute(TEXT_MAP),
      approx: element.getAttribute(TEXT_APPROX),
    },
    element.textContent?.length ?? 0,
  );
}

function offsetWithin(piece: HTMLElement, container: Node, offset: number): number {
  const range = piece.ownerDocument.createRange();
  range.setStart(piece, 0);
  range.setEnd(container, offset);
  return range.toString().length;
}

/**
 * The selection inside `root`, as a range of `fullText`. Null when nothing is
 * selected, or when the selection starts or ends outside the document's text
 * (a legend, a name chip, another part of the page).
 */
export function readSelection(root: HTMLElement, fullText: string): ReadSelection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const { startContainer, endContainer } = range;
  if (!root.contains(startContainer) || !root.contains(endContainer)) return null;
  // A boundary inside text must lie in a piece of the document's text: not in a chip.
  for (const container of [startContainer, endContainer]) {
    if (container.nodeType === Node.TEXT_NODE && !pieceOf(container, root)) return null;
  }

  const hit = [...root.querySelectorAll<HTMLElement>(`[${TEXT_START}]`)].filter((el) =>
    range.intersectsNode(el),
  );
  if (hit.length === 0) return null;
  const firstEl = hit[0];
  const lastEl = hit[hit.length - 1];
  const first = toPiece(firstEl);
  const last = toPiece(lastEl);
  if (!first || !last) return null;

  const from: Boundary = {
    piece: first,
    offset: firstEl.contains(startContainer)
      ? offsetWithin(firstEl, startContainer, range.startOffset)
      : 0,
  };
  const to: Boundary = {
    piece: last,
    offset: lastEl.contains(endContainer)
      ? offsetWithin(lastEl, endContainer, range.endOffset)
      : last.length,
  };
  const result = rangeBetween(fullText, from, to, selection.toString());
  if (!result) return null;

  const rects = range.getClientRects();
  const end = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  return {
    range: result,
    rect: { left: end.left, right: end.right, top: end.top, bottom: end.bottom },
  };
}
