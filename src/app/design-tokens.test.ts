import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * The look is a set of tokens in two places: `design/tokens.json` (the standard) and
 * `src/app/globals.css` (what the app uses). These tests keep them in step and check the
 * contrast rules of "Polder for apps" in `design/DESIGN.md`, in both themes.
 */

const ROOT = process.cwd();
const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const tokensJson = JSON.parse(readFileSync(path.join(ROOT, "design/tokens.json"), "utf8")) as {
  color: { tokens: { name: string; value: { light: string; dark: string } }[] };
};

/** The custom properties declared in the first block that starts with `selector {`. */
function variables(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} block not found in globals.css`);
  const end = css.indexOf("\n}", start);
  const out: Record<string, string> = {};
  for (const m of css.slice(start, end).matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const themes = {
  light: variables(":root"),
  dark: { ...variables(":root"), ...variables(".dark") },
};

function channel(hex: string, at: number): number {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `${hex} is not a six-digit hex colour`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** The WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens.json and globals.css agree", () => {
  for (const token of tokensJson.color.tokens) {
    for (const theme of ["light", "dark"] as const) {
      test(`${token.name} (${theme})`, () => {
        assert.equal(themes[theme][token.name], token.value[theme]);
      });
    }
  }
});

describe("contrast", () => {
  const TEXT = 4.5;
  const CONTROL = 3;
  /** Text tokens and the grounds they sit on. */
  const text: [string, string[]][] = [
    ["ink", ["bg", "surface-tint", "surface-raised", "surface-hover"]],
    ["ink-heading", ["bg", "surface-tint", "surface-raised"]],
    ["ink-muted", ["bg", "surface-tint", "surface-raised", "surface-hover"]],
    ["link", ["bg", "surface-tint", "surface-raised"]],
    ["danger", ["bg", "surface-tint", "surface-raised", "danger-soft"]],
    ["success", ["bg", "surface-tint", "success-soft"]],
    ["warning", ["bg", "surface-tint", "warning-soft"]],
    ["on-action", ["action"]],
    ["on-danger", ["danger"]],
  ];
  /** Borders and rings that identify a control or its state. */
  const control: [string, string[]][] = [
    ["border-control", ["bg", "surface-tint", "surface-raised"]],
    ["focus-ring", ["bg", "surface-tint", "surface-raised"]],
  ];

  for (const theme of ["light", "dark"] as const) {
    for (const [fg, grounds] of text) {
      for (const bg of grounds) {
        test(`${fg} on ${bg} is at least ${TEXT}:1 (${theme})`, () => {
          const ratio = contrast(themes[theme][fg], themes[theme][bg]);
          assert.ok(ratio >= TEXT, `${ratio.toFixed(2)}:1`);
        });
      }
    }
    for (const [fg, grounds] of control) {
      for (const bg of grounds) {
        test(`${fg} on ${bg} is at least ${CONTROL}:1 (${theme})`, () => {
          const ratio = contrast(themes[theme][fg], themes[theme][bg]);
          assert.ok(ratio >= CONTROL, `${ratio.toFixed(2)}:1`);
        });
      }
    }
    test(`a checked box (bg on link) is at least ${TEXT}:1 (${theme})`, () => {
      assert.ok(contrast(themes[theme].bg, themes[theme].link) >= TEXT);
    });
  }

  test("the figures DESIGN.md states", { skip: !process.env.PRINT_CONTRAST }, () => {
    for (const theme of ["light", "dark"] as const) {
      const t = themes[theme];
      console.log(theme, {
        ink_bg: contrast(t.ink, t.bg).toFixed(2),
        muted_bg: contrast(t["ink-muted"], t.bg).toFixed(2),
        muted_tint: contrast(t["ink-muted"], t["surface-tint"]).toFixed(2),
        muted_hover: contrast(t["ink-muted"], t["surface-hover"]).toFixed(2),
        ctl_bg: contrast(t["border-control"], t.bg).toFixed(2),
        ctl_tint: contrast(t["border-control"], t["surface-tint"]).toFixed(2),
        ctl_raised: contrast(t["border-control"], t["surface-raised"]).toFixed(2),
        ring_bg: contrast(t["focus-ring"], t.bg).toFixed(2),
        onaction: contrast(t["on-action"], t.action).toFixed(2),
      });
    }
  });
});
