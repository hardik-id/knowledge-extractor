import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

/** A violation the app cannot fix here (for example inside a third-party component). Each needs an issue. */
export interface AxeException {
  /** The axe rule id, for example "color-contrast". */
  rule: string;
  /** A CSS selector for the element the rule is waived on. */
  selector: string;
  /** The issue that tracks the fix. */
  issue: string;
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Scans the page with axe (WCAG A and AA) and fails with a readable list: for each
 * violation the rule, the page, and the elements. Call it once the screen is ready.
 */
export async function expectAccessible(
  page: Page,
  screen: string,
  exceptions: readonly AxeException[] = [],
) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const remaining = violations
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter(
        (node) =>
          !exceptions.some(
            (e) => e.rule === violation.id && node.target.some((t) => String(t) === e.selector),
          ),
      ),
    }))
    .filter((violation) => violation.nodes.length > 0);

  const report = remaining.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      `  page: ${screen} (${page.url()})\n` +
      violation.nodes
        .map((node) => `  - ${node.target.join(" ")}\n    ${node.html.slice(0, 160)}`)
        .join("\n"),
  );
  expect(report, `accessibility violations on ${screen}`).toEqual([]);
}
