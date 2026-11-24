import { expect } from "@playwright/test";
import { expectAccessible } from "../e2e/support/accessibility";
import { ALL_REAL, ALL_STUB, ONE_FAILING, badge, panel, test, realPart, stubApi } from "./support";

test("a scripted backend: the badge says Stub and the panel lists every part", async ({
  page,
  context,
}) => {
  await stubApi(context, { status: ALL_STUB });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Stub");
  await badge(page).click();
  await expect(panel(page).getByRole("heading", { name: "Backend status" })).toBeVisible();
  const rows = panel(page).getByRole("listitem");
  await expect(rows).toHaveCount(6);
  await expect(panel(page).locator('[data-part="assistant"]')).toContainText("Scripted");
  await expect(panel(page).locator('[data-part="assistant"]')).toContainText(
    "Stub, nothing to check",
  );
  await expect(panel(page).locator('[data-part="storage"]')).toContainText("Samples");
  await expect(panel(page).locator('[data-part="sign_in"]')).toContainText("Dev token");
  await expect(panel(page).locator('[data-part="live_updates"]')).toContainText("Redis");
  await expect(panel(page).locator('[data-part="worker"]')).toContainText("OK, checked 2m ago");
  await expect(panel(page).getByRole("button", { name: "Test connections" })).toBeVisible();
});

test("one failing part: Problem, with the reason in words", async ({ page, context }) => {
  await stubApi(context, { status: ONE_FAILING });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Problem");
  await badge(page).click();
  await expect(panel(page).locator('[data-part="worker"]')).toContainText(
    "Failing: the worker has stopped taking jobs",
  );
});

test("every part real and ok: Live", async ({ page, context }) => {
  await stubApi(context, { status: ALL_REAL });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Live");
});

test("a part the UI does not know is listed under its own name", async ({ page, context }) => {
  await stubApi(context, { status: [...ALL_REAL, realPart("search_index", "Solr")] });
  await page.goto("/studio");
  await badge(page).click();
  await expect(panel(page).locator('[data-part="search_index"]')).toContainText("Search index");
});

test("a 404 means the backend does not report: said in the panel, no toast, no error", async ({
  page,
  context,
}) => {
  await stubApi(context, { status: 404 });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Status unknown");
  await badge(page).click();
  await expect(panel(page)).toContainText("This backend does not report its status.");
  await expect(panel(page).getByRole("button", { name: "Test connections" })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});

test("it loads once when the app opens and once more each time the panel opens, never on a timer", async ({
  page,
  context,
}) => {
  const stub = await stubApi(context, { status: ALL_STUB });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Stub");
  // The development server runs effects twice, so the first load may be asked for twice.
  const afterLoad = stub.calls.length;
  expect(afterLoad).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(3000);
  expect(stub.calls).toHaveLength(afterLoad);
  await badge(page).click();
  await expect(panel(page)).toBeVisible();
  await expect.poll(() => stub.calls.length).toBe(afterLoad + 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  expect(stub.calls).toHaveLength(afterLoad + 1);
});

test("Test connections shows a working state, then the new rows", async ({ page, context }) => {
  const stub = await stubApi(context, {
    status: ONE_FAILING,
    test: { parts: ALL_REAL, delayMs: 800 },
  });
  await page.goto("/studio");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Problem");
  await badge(page).click();
  await panel(page).getByRole("button", { name: "Test connections" }).click();
  const working = panel(page).getByRole("button", { name: "Testing…" });
  await expect(working).toBeDisabled();
  await expect(panel(page).getByRole("button", { name: "Test connections" })).toBeVisible();
  await expect(panel(page).locator('[data-part="worker"]')).toContainText("OK, checked");
  await expect(badge(page)).toHaveAccessibleName("Backend status: Live");
  expect(stub.calls.filter((c) => c === "POST /status/test")).toHaveLength(1);
  // A fresh answer is not "cached".
  await expect(panel(page)).not.toContainText("Checked");
});

test("a cached answer says how old it is", async ({ page, context }) => {
  await stubApi(context, {
    status: ALL_STUB,
    test: {
      parts: ALL_STUB.map((p) => (p.id === "worker" ? realPart("worker", "Background worker") : p)),
      cached: true,
    },
  });
  await page.goto("/studio");
  await badge(page).click();
  await panel(page).getByRole("button", { name: "Test connections" }).click();
  await expect(panel(page)).toContainText(/Checked \d+ seconds? ago/);
});

for (const theme of ["light", "dark"] as const) {
  test(`the panel with a failing part passes the accessibility scan (${theme})`, async ({
    page,
    context,
  }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await stubApi(context, { status: ONE_FAILING });
    await page.goto("/studio");
    await badge(page).click();
    await expect(panel(page)).toBeVisible();
    await expectAccessible(page, `projects with the status panel, ${theme}`);
  });
}
