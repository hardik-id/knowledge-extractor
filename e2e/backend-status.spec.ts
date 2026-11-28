import { expect, platformAdmin, test } from "./fixtures";

/**
 * The status badge against the real stack (the compose file's scripted assistant and extractor).
 * Its rules and every shape of the answer are covered without a backend by `npm run
 * test:e2e:status`; this proves the real API's answer is what the badge reads.
 */
test("the badge reads the backend's status and the panel lists its parts, and a platform admin tests the connections", async ({
  contextFor,
}) => {
  // Only a platform admin may test the connections: the development issuer's default person is one.
  const page = await (await contextFor(platformAdmin())).newPage();
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
  // On the scripted stack the test only pings live updates: the rows stay as they are.
  const before = await panel.locator("li").allInnerTexts();
  await panel.getByRole("button", { name: "Test connections" }).click();
  await expect(panel.getByRole("button", { name: "Test connections" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Testing…" })).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(badge).toHaveAccessibleName("Backend status: Stub");
  await expect(row("assistant")).toContainText("Scripted");
  await expect(row("storage")).toContainText("Samples");
  await expect(row("sign_in")).toContainText("Dev token");
  const after = await panel.locator("li").allInnerTexts();
  // Same parts in the same order, and the stub rows read the same.
  expect(after.map((t) => t.split("\n")[0])).toEqual(before.map((t) => t.split("\n")[0]));
  for (const id of ["assistant", "extraction", "storage", "sign_in"]) {
    await expect(row(id)).toContainText("Stub, nothing to check");
  }
});

test("a person who is not a platform admin sees the parts and no Test connections button", async ({
  page,
}) => {
  await page.goto("/studio");
  const badge = page.getByRole("button", { name: /^Backend status: / });
  await expect(badge).toHaveAccessibleName("Backend status: Stub");
  await badge.click();
  const panel = page.getByRole("dialog", { name: "Backend status" });
  await expect(panel.locator('[data-part="assistant"]')).toContainText("Scripted");
  await expect(panel.locator('[data-part="storage"]')).toContainText("Samples");
  await expect(panel.getByRole("button", { name: "Test connections" })).toHaveCount(0);
});
