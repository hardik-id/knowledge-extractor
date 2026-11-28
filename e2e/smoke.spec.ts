import { expect, newPerson, test } from "./fixtures";
import { openNewWorkspaceDialog } from "./pages/studio";
import { clickUntilOpen } from "./support/first-click";

test("the workspace list opens, and a workspace is made, opened and deleted", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();

  const dialog = await openNewWorkspaceDialog(page);
  await dialog.getByLabel("Name").fill("Smoke workspace");
  await dialog.getByLabel("Description (optional)").fill("Made by the smoke test");
  await dialog.getByRole("button", { name: "Create workspace" }).click();

  // Making a workspace opens it, on its documents.
  await expect(page).toHaveURL(/\/studio\/workspaces\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

  await page.goto("/studio");
  const row = page.getByRole("listitem").filter({ hasText: "Smoke workspace" });
  await expect(row).toBeVisible();
  const confirm = await clickUntilOpen(
    page,
    row.getByRole("button", { name: "Delete" }),
    page.getByRole("dialog", { name: "Delete “Smoke workspace”?" }),
  );
  await confirm.getByRole("button", { name: "Delete workspace" }).click();

  await expect(page.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();
});

test("another person's workspace list stays empty", async ({ api, contextFor, page }) => {
  await api.createWorkspace({ name: "Private workspace" });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Private workspace" })).toBeVisible();

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  await otherPage.goto("/studio");
  await expect(otherPage.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();
  await expect(otherPage.getByText("Private workspace")).toHaveCount(0);
});
