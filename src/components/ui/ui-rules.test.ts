import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * The building blocks follow "Polder for apps" (design/DESIGN.md): tokens, not raw values.
 * A component that needs something the tokens don't have adds a token first.
 */

const DIR = path.join(process.cwd(), "src/components/ui");
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const RULES: { name: string; pattern: RegExp; why: string }[] = [
  {
    name: "a raw hex or rgb colour",
    pattern: /#[0-9a-fA-F]{3,8}\b|\brgba?\(/,
    why: "use a colour token",
  },
  {
    name: "a Tailwind palette colour",
    pattern: new RegExp(
      `\\b[a-z-]*(?:bg|text|border|ring|fill|stroke|outline|shadow|divide)-(?:${PALETTE})-\\d`,
    ),
    why: "use a colour token",
  },
  {
    name: "black or white",
    pattern: /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b/,
    why: "use a colour token",
  },
  {
    name: "a radius outside the scale",
    pattern: /\brounded-(?:sm|md|lg|xl|2xl|3xl|4xl|full|\[(?!inherit)[^\]]*\])/,
    why: "rounded-control (4px), rounded-panel (6px) or rounded-pill",
  },
  { name: "a 2px border", pattern: /\bborder-2\b/, why: "lines are 1px hairlines" },
  {
    name: "a raw font size",
    pattern: /\btext-\[\d+px\]/,
    why: "text-body, text-small, text-caption, text-title or text-section",
  },
  {
    name: "a focus style of its own",
    pattern: /\boutline-(?:none|hidden)\b|\bfocus(?:-visible)?:ring-/,
    why: "the focus ring comes from globals.css",
  },
];

describe("src/components/ui", () => {
  for (const file of files) {
    const source = readFileSync(path.join(DIR, file), "utf8");
    for (const rule of RULES) {
      test(`${file} has no ${rule.name}`, () => {
        const match = source.match(rule.pattern);
        assert.equal(match, null, `${match?.[0]}: ${rule.why}`);
      });
    }
  }
});
