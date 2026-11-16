import { parse } from "yaml";

export type FrontMatter = {
  /** Parsed top-level mapping, or null (no block, empty, invalid, or not a mapping). */
  data: Record<string, unknown> | null;
  /** The block's YAML text, or null when the document has no block. */
  raw: string | null;
  /** The Markdown without the front matter block. */
  body: string;
};

const BLOCK = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** Splits a leading YAML front matter block off Markdown. Never throws. */
export function splitFrontMatter(markdown: string): FrontMatter {
  const match = BLOCK.exec(markdown);
  if (!match) return { data: null, raw: null, body: markdown };
  const raw = match[1] ?? "";
  const body = markdown.slice(match[0].length);
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = null;
  }
  return { data, raw, body };
}
