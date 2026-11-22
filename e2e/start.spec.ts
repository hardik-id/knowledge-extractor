import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage } from "./pages/extraction";
import { DOCS, createProjectFromDialog, pickDocuments, scrollsSideways } from "./pages/studio";
import { expectAccessible } from "./support/accessibility";

/** A new project from the dialog, with one document picked, opened in extraction: the start panel. */
async function openStart(page: Page, name = "Start project") {
  await createProjectFromDialog(page, name);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
  await pickDocuments(page, [DOCS.roadmap]);
  await page.getByRole("button", { name: "Open in extraction" }).click();
  await expect(page).toHaveURL(/\/extract$/);
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
}

test("the dialog creates the project from the blank template and the start panel shows", async ({
  page,
}) => {
  const created = page.waitForRequest(
    (request) => request.method() === "POST" && /\/projects$/.test(new URL(request.url()).pathname),
  );
  await openStart(page);
  expect((await created).postDataJSON()).toMatchObject({ template_id: "blank" });

  // The open document on the left, the ways to begin on the right.
  await expect(page.getByTestId("start-document").getByRole("heading").first()).toBeVisible();
  const start = page.getByRole("complementary", { name: "Start" });
  await expect(start.getByRole("button", { name: "Suggest fields" })).toBeVisible();
  await expect(start.getByRole("button", { name: /^Policy rules/ })).toContainText("6 fields");
  await expect(start.getByRole("button", { name: /^Blank/ })).toHaveCount(0);
  await expect(start.getByRole("button", { name: "Add a field yourself" })).toBeVisible();
  await expect(page.getByTestId("version-line")).toHaveText("Nothing saved yet");
  await expect(page.getByRole("button", { name: "Run extraction" })).toBeDisabled();
});

test("a template row loads its fields as an unsaved change", async ({ page }) => {
  await openStart(page);
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  await expect(page.getByRole("tab", { name: "Define" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Fields of Rule" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(6);
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Run extraction" })).toBeEnabled();
});

test("Suggest fields asks the assistant and the tabs come back with its proposal", async ({
  page,
}) => {
  await openStart(page);
  await page.getByRole("button", { name: "Suggest fields" }).click();
  const extraction = new ExtractionPage(page);
  await expect(extraction.tab("Define")).toBeVisible();
  await expect(extraction.conversation).toContainText("Suggest fields for this document.");
  await expect(
    extraction.conversation.getByRole("region", { name: "Proposed changes" }),
  ).toBeVisible();
});

test("what the person wrote is what the assistant is asked", async ({ page }) => {
  await openStart(page);
  await page
    .getByRole("textbox", { name: "What do you want from these documents?" })
    .fill("one record per rule");
  await page.getByRole("button", { name: "Suggest fields" }).click();
  await expect(new ExtractionPage(page).conversation).toContainText("one record per rule");
});

test("Add a field yourself makes a record type named Record with one field", async ({ page }) => {
  await openStart(page);
  await page.getByRole("button", { name: "Add a field yourself" }).click();
  await expect(page.getByRole("textbox", { name: "Record type name" })).toHaveValue("Record");
  await expect(page.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(1);
});

test("the start panel has no accessibility violations and one orange action", async ({ page }) => {
  await openStart(page);
  await expectAccessible(page, "start panel");
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the start panel stacks under the document with no sideways scroll", async ({ page }) => {
    await openStart(page);
    expect(await scrollsSideways(page)).toBe(false);
    const document = await page.getByTestId("start-document").boundingBox();
    const panel = await page.getByRole("complementary", { name: "Start" }).boundingBox();
    expect(document && panel && panel.y >= document.y + document.height - 1).toBe(true);
  });
});
