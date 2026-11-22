import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";

const root = join(process.cwd(), "src");

/** The text a person can read in a source file: string literals and JSX text. */
function visibleStrings(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/"([^"\n]*)"|`([^`]*)`|'([^'\n]*)'/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? "";
    if (!/^[\w@/.:-]+$/.test(text) || text.includes(" ")) found.push(text);
  }
  for (const m of source.matchAll(/>([^<>{}\n]+)</g)) found.push(m[1]);
  return found.filter((t) => !/^import /.test(t));
}

const studioScreens = [
  ...readdirSync(join(root, "apps/studio"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join("apps/studio", f)),
  ...["run-button", "version-menu", "more-menu"].map((f) => `apps/studio/top-bar/${f}.tsx`),
  "features/extraction/version-history.tsx",
];

describe("Studio's wording", () => {
  for (const file of studioScreens) {
    test(`${file} says configuration, not definition`, () => {
      const offending = visibleStrings(readFileSync(join(root, file), "utf8")).filter((t) =>
        /definition/i.test(t),
      );
      assert.deepEqual(offending, []);
    });
  }

  test("error sentences take the word the app uses", () => {
    for (const code of ["definition_conflict", "invalid_definition", "unknown_field"]) {
      const error = new ApiError({ code, status: 409, message: "x" });
      assert.doesNotMatch(describeApiError(error, "configuration"), /definition/i);
      assert.match(describeApiError(error), /definition/);
    }
  });
});
