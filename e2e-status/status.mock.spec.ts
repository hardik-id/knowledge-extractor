import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { badge, openMockWorkspace, panel, test } from "./support";

test("the projects list says the data is the built-in mock", async ({ page }) => {
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Mock data");
  await badge(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "Backend status" })).toBeVisible();
  const row = panel(page).locator('[data-part="data"]');
  await expect(row).toContainText("Data");
  await expect(row).toContainText("Built-in mock, no API");
  // One row, and nothing to test.
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
  await expect(panel(page).getByRole("button", { name: "Test connections" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(badge(page)).toBeFocused();
});

test("the working screen's top bar has the badge, without crowding the bar", async ({ page }) => {
  await openMockWorkspace(page);
  const bar = page.getByTestId("project-top-bar").locator("visible=true");
  await expect(bar.getByRole("button", { name: "Backend status: Mock data" })).toBeVisible();
  await expectNoOverlap(page);
});

for (const width of [1600, 1440, 1280, 960, 390]) {
  test(`no overlap in the project bar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await openMockWorkspace(page);
    await expectNoOverlap(page);
    const box = await badge(page).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    if (width < 1600) {
      // The word is gone, the name still says the state.
      await expect(badge(page)).toHaveAccessibleName("Backend status: Mock data");
      await expect(badge(page).getByText("Mock data")).toBeHidden();
      expect(box!.width).toBeLessThan(48);
    } else {
      await expect(badge(page).getByText("Mock data")).toBeVisible();
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the panel and the bar pass the accessibility scan (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await openMockWorkspace(page);
    await expectNoViolations(page, "[data-testid=project-top-bar]");
    await badge(page).click();
    await expect(panel(page)).toBeVisible();
    await expectNoViolations(page, "[data-testid=status-panel]");
  });
}

test("the pipeline's mobile header has it too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pipeline/select");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Mock data");
});

/** Axe (WCAG A and AA) on one part of the page: the bar or the panel, which are what this change adds. */
async function expectNoViolations(page: import("@playwright/test").Page, selector: string) {
  const { violations } = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`),
    selector,
  ).toEqual([]);
}

/** No two controls of the bar's right side share a pixel. */
async function expectNoOverlap(page: import("@playwright/test").Page) {
  const bar = page.getByTestId("project-top-bar").locator("visible=true");
  const boxes = await bar.getByRole("button").evaluateAll((buttons) =>
    buttons
      .map((b) => ({
        name: b.getAttribute("aria-label") ?? b.textContent ?? "",
        r: b.getBoundingClientRect(),
      }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ name, r }) => ({ name, x: r.x, y: r.y, w: r.width, h: r.height })),
  );
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlaps =
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false);
    }
  }
}
