import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { openVersionMenu } from "./pages/extraction";
import { openStart, scrollsSideways } from "./pages/studio";
import { documentPane, openFields } from "./pages/working-screen";
import { expectAccessible } from "./support/accessibility";

/** The start panel in the field column (or its overlay on a narrow screen). */
const startPanel = (page: Page) => new AssistantDock(page).column;

test("the dialog creates the workspace from the blank template and the start panel shows", async ({
  page,
}) => {
  const created = page.waitForRequest(
    (request) =>
      request.method() === "POST" && /\/workspaces$/.test(new URL(request.url()).pathname),
  );
  await openStart(page);
  expect((await created).postDataJSON()).toMatchObject({ template_id: "blank" });

  // The open document on the left, the ways to begin in the column on the right.
  await expect(documentPane(page).getByRole("heading").first()).toBeVisible();
  const start = startPanel(page);
  await expect(start.getByRole("button", { name: "Suggest fields" })).toBeVisible();
  await expect(start.getByRole("button", { name: /^Policy rules/ })).toContainText("6 fields");
  await expect(start.getByRole("button", { name: /^Blank/ })).toHaveCount(0);
  await expect(start.getByRole("button", { name: "Add a field yourself" })).toBeVisible();
  // Nothing else of the column yet, and no switch between document and output.
  await expect(start.getByRole("button", { name: "Add field" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Output", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByTestId("version-line")).toHaveText("Nothing saved yet");
  await expect(
    page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ }),
  ).toBeDisabled();
});

test("a template row shows its fields as suggestions; Keep all loads them as an unsaved change", async ({
  page,
}) => {
  await openStart(page);
  const dock = new AssistantDock(page);
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  // The start panel gives way to the suggestions: the record type as a table marked as new.
  await expect(dock.bar).toContainText("suggested change");
  await expect(dock.column.getByText("New record type")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("version-line")).toHaveText("Nothing saved yet");
  await expect(
    page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ }),
  ).toBeDisabled();

  await dock.bar.getByRole("button", { name: "Keep all" }).click();
  await expect(page.getByRole("table", { name: "Fields of Rule" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(6);
  await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
  await expect(
    page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ }),
  ).toBeEnabled();
  // The save note starts with the template's name.
  const menu = await openVersionMenu(page);
  await expect(
    menu.getByRole("form", { name: "Save configuration" }).getByLabel("Note (optional)"),
  ).toHaveValue("From template: Policy rules");
});

test("Discard all on a template brings the start panel back", async ({ page }) => {
  await openStart(page);
  const dock = new AssistantDock(page);
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  await expect(dock.bar).toBeVisible();

  await dock.bar.getByRole("button", { name: "Discard all" }).click();
  await expect(dock.bar).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
  await expect(page.getByTestId("version-line")).toHaveText("Nothing saved yet");
});

test("a template offer does not follow the person into another workspace", async ({ page }) => {
  await openStart(page, "Offer workspace A");
  const dock = new AssistantDock(page);
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  await expect(dock.bar).toContainText("suggested change");

  // A client-side move to Workspaces, then a second workspace: nothing suggested there.
  await page.getByRole("link", { name: "Workspaces" }).first().click();
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  await openStart(page, "Offer workspace B");
  await expect(dock.bar).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Suggested changes" })).toHaveCount(0);
});

test("Suggest fields asks the assistant, opens the conversation and shows its proposal as rows", async ({
  page,
}) => {
  await openStart(page);
  const dock = new AssistantDock(page);
  await page.getByRole("button", { name: "Suggest fields" }).click();
  await expect(dock.conversation).toContainText("Suggest fields for this document.");
  await expect(dock.bar).toContainText("suggested change");
  // A proposal is not saved.
  await expect(page.getByTestId("version-line")).toContainText("Nothing saved yet");

  await dock.bar.getByRole("button", { name: "Keep all" }).click();
  await expect(page.getByRole("button", { name: /^More actions for / }).first()).toBeVisible();
  await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
});

test("what the person wrote is what the assistant is asked", async ({ page }) => {
  await openStart(page);
  await page
    .getByRole("textbox", { name: "What do you want from these documents?" })
    .fill("one record per rule");
  await page.getByRole("button", { name: "Suggest fields" }).click();
  await expect(new AssistantDock(page).conversation).toContainText("one record per rule");
});

test("Add a field yourself makes a record type named Record with one field", async ({ page }) => {
  await openStart(page);
  await page.getByRole("button", { name: "Add a field yourself" }).click();
  await expect(page.getByRole("heading", { name: "Record", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(1);
  await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
  await expect(
    page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ }),
  ).toBeEnabled();
});

test("the start panel has no accessibility violations and one orange action", async ({ page }) => {
  await openStart(page);
  await expect(page.locator('button[data-variant="default"]:visible')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Suggest fields" })).toHaveAttribute(
    "data-variant",
    "default",
  );
  await expectAccessible(page, "start panel");
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("no sideways scroll and every way to begin is reachable", async ({ page }) => {
      await openStart(page);
      expect(await scrollsSideways(page)).toBe(false);
      const fresh = page.getByRole("button", { name: "Add a field yourself" });
      await fresh.scrollIntoViewIfNeeded();
      await expect(fresh).toBeInViewport();
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the start panel is in the Fields overlay, with no sideways scroll", async ({ page }) => {
    await openStart(page);
    expect(await scrollsSideways(page)).toBe(false);
    await expect(page.getByRole("button", { name: "Suggest fields" })).toHaveCount(0);
    await openFields(page);
    await expect(page.getByRole("button", { name: "Suggest fields" })).toBeVisible();
    // A long template name does not squeeze its description into a narrow column.
    const row = await page
      .getByRole("button", { name: /^Architecture decision records/ })
      .boundingBox();
    expect(row && row.height).toBeLessThan(140);
  });
});
