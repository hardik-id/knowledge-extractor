import type { TextSpan } from "@/services/contracts";

/**
 * Spans from the backend count Unicode code points; JavaScript strings are
 * indexed in UTF-16 units. These helpers convert between the two and cut text
 * into highlighted pieces.
 */

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

interface PairIndex {
  /** String index of the high surrogate of each pair, ascending. */
  starts: number[];
}

let cachedText: string | null = null;
let cachedIndex: PairIndex = { starts: [] };

/** The positions of the surrogate pairs in `text`, remembered for the last text asked about. */
function pairsOf(text: string): number[] {
  if (cachedText !== text) {
    const starts: number[] = [];
    for (let i = 0; i < text.length - 1; i++) {
      if (isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1))) {
        starts.push(i);
        i++;
      }
    }
    cachedText = text;
    cachedIndex = { starts };
  }
  return cachedIndex.starts;
}

/** How many entries of the ascending list satisfy `pred` (which must be true for a prefix). */
function countWhile(list: number[], pred: (value: number, position: number) => boolean): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(list[mid], mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function codePointToIndex(text: string, codePoint: number): number {
  if (!(codePoint > 0)) return 0;
  const pairs = pairsOf(text);
  if (pairs.length === 0) return Math.min(Math.floor(codePoint), text.length);
  const total = text.length - pairs.length;
  const cp = Math.floor(codePoint);
  if (cp >= total) return text.length;
  // The k-th pair sits at code point `start - k`; pairs before `cp` add one unit each.
  const before = countWhile(pairs, (start, k) => start - k < cp);
  return cp + before;
}

export function indexToCodePoint(text: string, index: number): number {
  let i = Math.min(Math.max(Math.floor(index) || 0, 0), text.length);
  if (i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i))) {
    i -= 1;
  }
  const pairs = pairsOf(text);
  // Pairs lying wholly before `i`.
  const before = countWhile(pairs, (start) => start + 2 <= i);
  return i - before;
}

/** A span in JavaScript string indices. */
export interface IndexRange {
  start: number;
  end: number;
}

/**
 * Where a span is in `text`, or null when its quote isn't there. Uses the
 * offsets when the text at them equals the quote; otherwise finds the
 * occurrence of the quote nearest to the offsets. An empty quote gives null.
 */
export function locateSpan(text: string, span: TextSpan): IndexRange | null {
  const { quote } = span;
  if (quote === "") return null;
  const start = codePointToIndex(text, span.start);
  const end = start + quote.length;
  if (text.slice(start, end) === quote) return { start, end };
  let best = -1;
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    if (best === -1 || Math.abs(at - start) < Math.abs(best - start)) best = at;
    else if (at > start) break; // later ones are only further away
  }
  return best === -1 ? null : { start: best, end: best + quote.length };
}

/** The span for a range of string indices (e.g. a selection). Clamps, orders start/end, and never splits a surrogate pair. */
export function spanFromRange(text: string, start: number, end: number): TextSpan {
  const clamp = (n: number) => Math.min(Math.max(Math.floor(n) || 0, 0), text.length);
  let a = clamp(Math.min(start, end));
  let b = clamp(Math.max(start, end));
  const inPair = (i: number) =>
    i > 0 && i < text.length && isHigh(text.charCodeAt(i - 1)) && isLow(text.charCodeAt(i));
  if (inPair(a)) a -= 1;
  if (inPair(b)) b += 1;
  return {
    start: indexToCodePoint(text, a),
    end: indexToCodePoint(text, b),
    quote: text.slice(a, b),
  };
}

export interface Mark<T> {
  start: number;
  end: number;
  data: T;
}

export interface Segment<T> {
  start: number;
  end: number;
  text: string;
  /** The marks covering this piece, in input order. */
  marks: T[];
}

/**
 * Cuts text[from, to) into consecutive pieces so that every piece is covered
 * by the same set of marks. Overlapping and nested marks are supported; empty
 * and out-of-range marks are ignored (marks partly in range are clipped).
 * Unmarked pieces have `marks: []`. The pieces concatenate back to the text.
 */
export function segmentText<T>(
  text: string,
  marks: Mark<T>[],
  from = 0,
  to = text.length,
): Segment<T>[] {
  const lo = Math.min(Math.max(from, 0), text.length);
  const hi = Math.min(Math.max(to, lo), text.length);
  const live = marks
    .map((m) => ({ start: Math.max(m.start, lo), end: Math.min(m.end, hi), data: m.data }))
    .filter((m) => m.start < m.end);
  const cuts = new Set<number>([lo, hi]);
  for (const m of live) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment<T>[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    segments.push({
      start,
      end,
      text: text.slice(start, end),
      marks: live.filter((m) => m.start <= start && m.end >= end).map((m) => m.data),
    });
  }
  return segments;
}
