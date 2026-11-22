import { expect, test } from "./fixtures";
import {
  addDocument,
  apiAs,
  createProjectFromDialog,
  extractPath,
  openNewProjectDialog,
  scrollsSideways,
} from "./pages/studio";

/** Makes the project from the dialog, then opens its extraction page (it needs a document). */
async function openDefine(
  page: import("@playwright/test").Page,
  person: Parameters<typeof addDocument>[0],
  name: string,
) {
  await createProjectFromDialog(page, name);
  const id = page.url().split("/").pop()!;
  const request = await apiAs(person);
  const runId = await request
    .get(`projects/${id}`)
    .then(async (response) => ((await response.json()) as { run_id: string }).run_id)
    .finally(() => request.dispose());
  await addDocument(person, runId);
  await page.goto(extractPath(id));
  await expect(page.getByTestId("version-line")).toBeVisible();
}

test("a new project shows the start panel", async ({ page, person }) => {
  await openDefine(page, person, "Blank project");
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Define" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("the new project's card shows Configuration version 1", async ({ page }) => {
  await createProjectFromDialog(page, "Policies");
  await page.goto("/studio");
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Policies" }) });
  await expect(card.getByText("Configuration version 1")).toBeVisible();
});

test("the rename dialog has no picker", async ({ api, page }) => {
  await api.createProject({ name: "Old" });
  await page.goto("/studio");
  await page.getByRole("button", { name: /^Edit / }).click();
  const dialog = page.getByRole("dialog", { name: "Edit project" });
  await expect(dialog.getByLabel("Name")).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
});

test("the dialog works with the keyboard alone", async ({ page }) => {
  await page.goto("/studio");
  const dialog = await openNewProjectDialog(page);
  await page.keyboard.type("By keyboard");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Typed description");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Create project" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/studio\/projects\/[^/]+$/);
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the dialog fits and its buttons are reachable", async ({ page }) => {
    await page.goto("/studio");
    const dialog = await openNewProjectDialog(page);
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    expect(await scrollsSideways(page)).toBe(false);
    // The dialog itself must not scroll sideways either (its form once grew to the width of the text).
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Create project" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  });
});
