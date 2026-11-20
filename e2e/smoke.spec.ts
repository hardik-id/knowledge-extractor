import { expect, newPerson, test } from "./fixtures";
import { openNewProjectDialog } from "./pages/studio";
import { clickUntilOpen } from "./support/first-click";

test("the project list opens, and a project is made, opened and deleted", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();

  const dialog = await openNewProjectDialog(page);
  await dialog.getByLabel("Name").fill("Smoke project");
  await dialog.getByLabel("Description (optional)").fill("Made by the smoke test");
  await dialog.getByRole("button", { name: "Create project" }).click();

  // Making a project opens it, on its documents.
  await expect(page).toHaveURL(/\/studio\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

  await page.goto("/studio");
  const row = page.getByRole("listitem").filter({ hasText: "Smoke project" });
  await expect(row).toBeVisible();
  const confirm = await clickUntilOpen(
    page,
    row.getByRole("button", { name: "Delete" }),
    page.getByRole("dialog", { name: "Delete “Smoke project”?" }),
  );
  await confirm.getByRole("button", { name: "Delete project" }).click();

  await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
});

test("another person's project list stays empty", async ({ api, contextFor, page }) => {
  await api.createProject({ name: "Private project" });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Private project" })).toBeVisible();

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  await otherPage.goto("/studio");
  await expect(otherPage.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  await expect(otherPage.getByText("Private project")).toHaveCount(0);
});
