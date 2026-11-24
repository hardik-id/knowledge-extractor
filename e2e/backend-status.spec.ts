import { expect, test } from "./fixtures";

/**
 * The status badge against the real stack (the compose file's scripted assistant and extractor).
 * Its rules and every shape of the answer are covered without a backend by `npm run
 * test:e2e:status`; this proves the real API's answer is what the badge reads.
 */
test("the badge reads the backend's status and the panel lists its parts", async ({ page }) => {
  await page.goto("/studio");
  const badge = page.getByRole("button", { name: /^Backend status: / });
  await expect(badge).toHaveAccessibleName("Backend status: Stub");
  await badge.click();
  const panel = page.getByRole("dialog", { name: "Backend status" });
  await expect(panel).toBeVisible();
  const row = (id: string) => panel.locator(`[data-part="${id}"]`);
  await expect(row("assistant")).toContainText("Scripted");
  await expect(row("extraction")).toContainText("Scripted");
  await expect(row("storage")).toContainText("Samples");
  await expect(row("sign_in")).toContainText("Dev token");
  // Live updates and the worker are real on the scripted stack.
  await expect(row("live_updates")).not.toContainText("Stub");
  await expect(row("worker")).not.toContainText("Stub");
  await expect(panel.getByRole("button", { name: "Test connections" })).toBeVisible();
});
