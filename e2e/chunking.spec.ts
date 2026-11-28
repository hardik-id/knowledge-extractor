import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import {
  ChunkingRow,
  ExtractionPage,
  openVersionHistory,
  workspaceWithDocuments,
  saveConfiguration,
} from "./pages/extraction";
import { fieldColumn, openFields, openOneScreen } from "./pages/working-screen";
import {
  createWorkspaceFromDialog,
  pickDocuments,
  submitDocumentsButton,
  DOCS,
} from "./pages/studio";
import { expectAccessible } from "./support/accessibility";

const DOCUMENTS = ["platform-adrs.md"];

const versionLine = (page: Page) => page.getByTestId("version-line");

test.beforeEach(async ({ api, expectApiError, page, person, request }) => {
  // Before a first run the backend answers 404 for the document's extraction.
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace);
});

test("the row is closed and says Automatic; there is nothing unsaved", async ({ page }) => {
  const row = new ChunkingRow(page);
  await expect(row.header).toHaveAttribute("aria-expanded", "false");
  await row.expectSummary("Automatic");
  await expect(versionLine(page)).not.toContainText("unsaved changes");
  await expect(row.strategy).toBeHidden();
  // The header controls the panel it opens.
  const controls = await row.header.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  await row.header.click();
  await expect(page.locator(`[id="${controls}"]`)).toBeVisible();
  await expect(row.strategy).toHaveValue("auto");
  await expect(row.size).toHaveCount(0);
});

test("a strategy and a size are shown, marked unsaved, saved, kept after a reload and restored", async ({
  page,
}) => {
  const row = new ChunkingRow(page);
  await row.choose("By paragraph");
  await row.expectSummary("By paragraph, 4000 characters");
  await expect(row.size).toHaveValue("4000");
  await expect(versionLine(page)).toHaveText("Version 1 · unsaved changes");

  await row.size.fill("3000");
  await row.expectSummary("By paragraph, 3000 characters");
  await saveConfiguration(page, "Paragraphs");
  await expect(versionLine(page)).toHaveText("Version 2");

  await page.reload();
  const reloaded = new ChunkingRow(page);
  await reloaded.expectSummary("By paragraph, 3000 characters");
  await expect(versionLine(page)).toHaveText("Version 2");
  await reloaded.open();
  await expect(reloaded.strategy).toHaveValue("paragraph");
  await expect(reloaded.size).toHaveValue("3000");

  // The version saved before is automatic, and restoring it is not "unsaved".
  const history = await openVersionHistory(page);
  await history.getByRole("button", { name: "View version 1" }).click();
  await history.getByRole("button", { name: "Restore this version" }).click();
  await expect(versionLine(page)).toContainText("Version 3");
  await expect(versionLine(page)).not.toContainText("unsaved changes");
  await reloaded.expectSummary("Automatic");
  await expect(reloaded.size).toHaveCount(0);

  // And the one with the setting can be restored again.
  const again = await openVersionHistory(page);
  await again.getByRole("button", { name: "View version 2" }).click();
  await again.getByRole("button", { name: "Restore this version" }).click();
  await expect(versionLine(page)).toContainText("Version 4");
  await reloaded.expectSummary("By paragraph, 3000 characters");
  await expect(versionLine(page)).not.toContainText("unsaved changes");
});

test("choosing Automatic again clears the size and the unsaved mark", async ({ page }) => {
  const row = new ChunkingRow(page);
  await row.choose("Fixed size");
  await row.expectSummary("Fixed size, 4000 characters");
  await row.choose("Automatic");
  await row.expectSummary("Automatic");
  await expect(row.size).toHaveCount(0);
  await expect(versionLine(page)).not.toContainText("unsaved changes");
});

test("running saves the chunking as a new version", async ({ page }) => {
  const row = new ChunkingRow(page);
  await row.choose("By heading");
  const extraction = new ExtractionPage(page);
  await extraction.run();
  await expect(versionLine(page)).toContainText("Version 2");
  await expect(versionLine(page)).not.toContainText("unsaved changes");
  await extraction.finished();
  await row.expectSummary("By heading, 4000 characters");
});

test("a wrong size shows its message in place and does not block typing", async ({ page }) => {
  const row = new ChunkingRow(page);
  await row.choose("Fixed size");
  const message = page.getByText("Enter a whole number from 1000 to 8000.");
  for (const bad of ["500", "9000", "1500.5", ""]) {
    await row.size.fill(bad);
    await expect(message).toBeVisible();
    await expect(row.size).toHaveAttribute("aria-invalid", "true");
    await expect(row.size).toHaveValue(bad);
  }
  await row.size.fill("1500");
  await expect(message).toHaveCount(0);
  await expect(row.size).not.toHaveAttribute("aria-invalid", "true");
  await row.expectSummary("Fixed size, 1500 characters");
});

test("a wrong size is not saved: saving opens the row on the message", async ({ page }) => {
  const row = new ChunkingRow(page);
  await row.choose("Fixed size");
  await row.size.fill("200");
  await row.header.click();
  await expect(row.header).toHaveAttribute("aria-expanded", "false");
  await new ExtractionPage(page).runButton.click();
  await expect(row.header).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Enter a whole number from 1000 to 8000.")).toBeVisible();
  await expect(versionLine(page)).toContainText("Version 1");
});

test("the server's message about the size is shown in place", async ({ expectApiError, page }) => {
  expectApiError({ status: 422, method: "PUT" });
  const row = new ChunkingRow(page);
  await row.choose("Fixed size");
  await row.size.fill("8000");
  await page.route(/\/definition$/, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_definition",
        message: "The definition is not valid.",
        details: {
          errors: [
            {
              path: "chunking",
              message: "The chunk size must be between 1000 and 6000 characters.",
            },
          ],
        },
      }),
    });
  });
  try {
    await saveConfiguration(page);
    await expect(
      page.getByText("The chunk size must be between 1000 and 6000 characters."),
    ).toBeVisible();
    // Changing the size takes the message away.
    await row.size.fill("5000");
    await expect(
      page.getByText("The chunk size must be between 1000 and 6000 characters."),
    ).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("keeping an assistant proposal keeps the chosen chunking", async ({ page }) => {
  const row = new ChunkingRow(page);
  await row.choose("Fixed size");
  await row.size.fill("2000");
  const dock = new AssistantDock(page);
  await dock.ask("add a field for the approver");
  await expect(dock.bar).toContainText("2 suggested changes");
  await dock.bar.getByRole("button", { name: "Keep all" }).click();
  await expect(dock.bar).toHaveCount(0);
  await row.expectSummary("Fixed size, 2000 characters");
  await saveConfiguration(page);
  await expect(versionLine(page)).toHaveText("Version 2");
  await row.expectSummary("Fixed size, 2000 characters");
  await page.reload();
  await new ChunkingRow(page).expectSummary("Fixed size, 2000 characters");
});

test("the row is not on the start panel", async ({ page }) => {
  await createWorkspaceFromDialog(page, "Fresh workspace");
  await pickDocuments(page, [DOCS.roadmap]);
  await submitDocumentsButton(page).click();
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
  await expect(new ChunkingRow(page).header).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the open row has no accessibility violations", async ({ api, page, person, request }) => {
      // The documents the other accessibility scans use (a longer one makes the document pane scroll).
      const workspace = await workspaceWithDocuments(api, person, request, [
        DOCS.roadmap,
        DOCS.runbook,
      ]);
      await openOneScreen(page, workspace);
      const row = new ChunkingRow(page);
      await row.choose("By paragraph");
      await expect(row.size).toBeVisible();
      await expectAccessible(page, `chunking row, open (${scheme})`);
      await row.size.fill("500");
      await expect(page.getByText("Enter a whole number from 1000 to 8000.")).toBeVisible();
      await expectAccessible(page, `chunking row, open with a problem (${scheme})`);
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the open row leaves the table within reach", async ({ page }) => {
    await openFields(page);
    const row = new ChunkingRow(page);
    await row.choose("Fixed size");
    await expect(row.size).toBeInViewport();
    const column = fieldColumn(page).or(page.getByRole("dialog", { name: "Fields" }));
    const table = column.getByRole("region", { name: "Field list" });
    await expect(table).toBeVisible();
    const box = (await table.boundingBox())!;
    // The table keeps real room under the open row, and the page does not scroll sideways.
    expect(box.height).toBeGreaterThan(150);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await expect(table.getByRole("row").nth(1)).toBeVisible();
  });
});
