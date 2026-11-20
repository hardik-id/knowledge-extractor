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
  template?: string,
) {
  await createProjectFromDialog(page, name, template);
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

test("a project made from Agent skills starts with the Skill record type and says so in its history", async ({
  page,
  person,
}) => {
  await openDefine(page, person, "Skills project", "Agent skills");
  const fields = page.getByRole("table", { name: "Fields of Skill" });
  await expect(fields).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(5);

  await page.getByRole("button", { name: "Version history" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await expect(history.getByText("From template: Agent skills")).toBeVisible();
});

test("a project made without touching the picker starts as ADR", async ({ page, person }) => {
  await page.goto("/studio");
  const dialog = await openNewProjectDialog(page);
  await expect(dialog.getByRole("radio", { name: /^Architecture decision records/ })).toBeChecked();
  await openDefine(page, person, "Default project");
  await expect(page.getByRole("table", { name: "Fields of ADR" })).toBeVisible();
});

test("a project made from Blank shows the empty Define tab", async ({ page, person }) => {
  await openDefine(page, person, "Blank project", "Blank");
  await expect(page.getByText("Not sure which fields you need?")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("the new project's card shows Configuration version 1", async ({ page }) => {
  await createProjectFromDialog(page, "Policies", "Policy rules");
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
  const first = dialog.getByRole("radio", { name: /^Architecture decision records/ });
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("radio", { name: /^Agent skills/ })).toBeChecked();
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
    await expect(dialog.getByRole("radio", { name: /^Blank/ })).toBeAttached();
    expect(await scrollsSideways(page)).toBe(false);
    // The dialog itself must not scroll sideways either (its form once grew to the width of the text).
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Create project" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  });
});
