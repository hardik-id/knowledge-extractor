import { expect, test } from "./fixtures";
import {
  hasInnerScroll,
  openDocuments,
  openNewProjectDialog,
  scrollsSideways,
} from "./pages/studio";

test.describe("the New project dialog on a desktop", () => {
  test.use({ viewport: { width: 1360, height: 900 } });

  test("shows all four templates with no scrollbar", async ({ page }) => {
    await page.goto("/studio");
    const dialog = await openNewProjectDialog(page);
    const templates = dialog.getByRole("radio");
    await expect(templates).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(templates.nth(i)).toBeInViewport({ ratio: 1 });
    expect(await hasInnerScroll(dialog), "the dialog scrolls").toBe(false);
    await expect(dialog.getByRole("button", { name: "Create project" })).toBeInViewport({
      ratio: 1,
    });
  });
});

test.describe("the New project dialog on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("fits, and its buttons stay reachable", async ({ page }) => {
    await page.goto("/studio");
    const dialog = await openNewProjectDialog(page);
    await expect(dialog.getByRole("radio")).toHaveCount(4);
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Create project" })).toBeInViewport({
      ratio: 1,
    });
    expect(await scrollsSideways(page)).toBe(false);
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390, "inside the screen").toBe(true);
  });
});

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1360, height: 900 } });

  test("a project's Edit and Delete show on keyboard focus and the one primary action is New project", async ({
    api,
    page,
  }) => {
    await api.createProject({ name: "Quiet actions", description: "One line" });
    await page.goto("/studio");
    const edit = page.getByRole("button", { name: "Edit Quiet actions" });
    await expect(edit).toBeAttached();
    await expect(edit).toHaveCSS("opacity", "0");
    await edit.focus();
    await expect(edit).toHaveCSS("opacity", "1");
    await edit.press("Enter");
    await expect(page.getByRole("dialog", { name: "Edit project" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Delete Quiet actions" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Delete “Quiet actions”?" });
    await expect(dialog.getByText("All the records extracted in it")).toBeVisible();
  });

  test("the Documents toolbar keeps the search, the count and Select all shown on one line", async ({
    api,
    page,
  }) => {
    const project = await api.createProject({ name: "Toolbar" });
    await openDocuments(page, project);
    const search = page.getByRole("searchbox", { name: "Search documents" });
    const count = page.getByText(/\d+ documents? found/);
    const all = page.getByRole("button", { name: "Select all shown" });
    await expect(all).toBeVisible();
    const [a, b, c] = await Promise.all([search, count, all].map((l) => l.boundingBox()));
    expect(
      Math.abs((a?.y ?? 0) + (a?.height ?? 0) / 2 - ((c?.y ?? 0) + (c?.height ?? 0) / 2)),
    ).toBeLessThan(6);
    expect(
      Math.abs((b?.y ?? 0) + (b?.height ?? 0) / 2 - ((c?.y ?? 0) + (c?.height ?? 0) / 2)),
    ).toBeLessThan(6);
    await expect(page.getByRole("columnheader", { name: "Folder" })).toBeVisible();
    await all.click();
    await expect(page.getByRole("button", { name: "Deselect all shown" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open in extraction" })).toBeEnabled();
  });
});
