import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * The focus ring is one rule in globals.css (a 2px outline in the focus-ring colour). An
 * element that swaps it for a Tailwind ring (`focus-visible:ring-*`) loses the outline, and so
 * the ring other controls show. The e2e suite only offers Studio, so it never sees the app
 * switcher: this guards the whole source instead.
 */

const SRC = path.join(process.cwd(), "src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("focus ring", () => {
  for (const file of sources(SRC)) {
    test(`${path.relative(SRC, file)} has no ring of its own`, () => {
      const match = readFileSync(file, "utf8").match(/\bfocus(?:-visible|-within)?:ring-\S*/);
      assert.equal(match, null, `${match?.[0]}: the focus ring comes from globals.css`);
    });
  }
});
