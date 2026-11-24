import { expect, test } from "./fixtures";

/**
 * The status badge against the real stack (the compose file's scripted assistant and extractor).
 * Its rules and every shape of the answer are covered without a backend by `npm run
 * test:e2e:status`; this proves the real API's answer is what the badge reads. A backend that
 * does not have `GET /status` yet answers 404, and then the badge says so.
 */
test("the badge reads the backend's status and the panel lists its parts", async ({ page }) => {
  await page.goto("/studio");
  const badge = page.getByRole("button", { name: /^Backend status: / });
  await expect(badge).not.toHaveAccessibleName("Backend status: Checking");
  await badge.click();
  const panel = page.getByRole("dialog", { name: "Backend status" });
  await expect(panel).toBeVisible();
  if ((await badge.getAttribute("aria-label")) === "Backend status: Status unknown") {
    await expect(panel).toContainText("This backend does not report its status.");
    return;
  }
  await expect(badge).toHaveAccessibleName("Backend status: Stub");
  await expect(panel.locator('[data-part="assistant"]')).toContainText("Scripted");
  await expect(panel.locator('[data-part="extraction"]')).toContainText("Scripted");
  await expect(panel.getByRole("button", { name: "Test connections" })).toBeVisible();
});
