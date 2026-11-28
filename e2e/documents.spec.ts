import { RecordStripPage } from "./pages/record-strip";
import { expectWorkingScreen } from "./pages/working-screen";
import { expectAccessible } from "./support/accessibility";
import { expect, test } from "./fixtures";
import {
  DOCS,
  addDocument,
  documentsSheet,
  openDocumentsSheet,
  saveDocuments,
  scrollsSideways,
} from "./pages/studio";
import { ExtractionPage } from "./pages/extraction";

test("the sheet adds a document and removes one", async ({ api, expectApiError, page, person }) => {
  // Taking a document out makes the app look for its reviewed records: there are none.
  expectApiError({ status: 404, method: "GET", path: /\/extraction$/ });
  const workspace = await api.createWorkspace({ name: "Sheet workspace" });
  await addDocument(person, workspace.run_id);
  await page.goto(`/studio/workspaces/${workspace.id}`);
  await expectWorkingScreen(page);

  const sheet = await openDocumentsSheet(page);
  await expect(sheet.getByText("1 document selected")).toBeVisible();
  await sheet.getByRole("checkbox", { name: DOCS.roadmap }).check();
  await expect(sheet.getByText("2 documents selected")).toBeVisible();
  await saveDocuments(page);
  await expect(page.getByRole("group", { name: "Document" })).toContainText("1 of 2");

  const again = await openDocumentsSheet(page);
  await again.getByRole("checkbox", { name: DOCS.decisions }).uncheck();
  await saveDocuments(page);
  await expect(page.getByRole("group", { name: "Document" })).toContainText("1 of 1");
});

test("cancelling the sheet keeps the documents as they were", async ({ api, page, person }) => {
  const workspace = await api.createWorkspace({ name: "Cancelled sheet" });
  await addDocument(person, workspace.run_id);
  await page.goto(`/studio/workspaces/${workspace.id}`);
  await expectWorkingScreen(page);

  const sheet = await openDocumentsSheet(page);
  await sheet.getByRole("checkbox", { name: DOCS.roadmap }).check();
  await expect(sheet.getByText("2 documents selected")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("group", { name: "Document" })).toContainText("1 of 1");

  const reopened = await openDocumentsSheet(page);
  await expect(reopened.getByText("1 document selected")).toBeVisible();
});

test("removing a document with reviewed records asks first", async ({
  api,
  expectApiError,
  page,
  person,
}) => {
  // The document added below was never extracted: "extraction_not_found" is how the API says so.
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
  const workspace = await api.createWorkspace({ name: "Reviewed removal" });
  await addDocument(person, workspace.run_id);
  await page.goto(`/studio/workspaces/${workspace.id}`);
  const extraction = new ExtractionPage(page);
  await expectWorkingScreen(page);
  await extraction.run("Run extraction");
  await extraction.finished();
  // Review the records from the list of the strip.
  const list = await new RecordStripPage(page).openList();
  await list.getByRole("button", { name: "Accept all suggested" }).click();
  await expect(list.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();

  const sheet = await openDocumentsSheet(page);
  await sheet.getByRole("checkbox", { name: DOCS.roadmap }).check();
  await saveDocuments(page);
  // Both stay: now take the reviewed one out.
  const second = await openDocumentsSheet(page);
  await second.getByRole("checkbox", { name: "architecture-decisions-2026.md" }).uncheck();
  await second.getByRole("button", { name: "Save documents" }).click();

  const confirm = page.getByRole("dialog", { name: "Remove documents with reviewed records?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("architecture-decisions-2026.md");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(documentsSheet(page)).toBeVisible();

  await second.getByRole("button", { name: "Save documents" }).click();
  await confirm.getByRole("button", { name: "Remove documents" }).click();
  await expect(page.getByText("Documents saved")).toBeVisible();
  await expect(documentsSheet(page)).toBeHidden();
});

for (const size of [
  { name: "1440 x 900", width: 1440, height: 900 },
  { name: "1280 x 720", width: 1280, height: 720 },
  { name: "390 x 844", width: 390, height: 844 },
]) {
  test.describe(`at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("the sheet is accessible and does not scroll the page sideways", async ({
      api,
      page,
      person,
    }) => {
      const workspace = await api.createWorkspace({ name: "Sheet scan" });
      await addDocument(person, workspace.run_id);
      await page.goto(`/studio/workspaces/${workspace.id}`);
      await expectWorkingScreen(page);
      const sheet = await openDocumentsSheet(page);
      await expect(sheet.getByRole("checkbox", { name: DOCS.roadmap })).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Save documents" })).toBeInViewport();
      await expect(sheet.getByRole("button", { name: "Cancel" })).toBeInViewport();
      await expectAccessible(page, "Documents sheet");
      expect(await scrollsSideways(page), "the page scrolls sideways").toBe(false);
    });
  });
}

test("Escape closes the sheet and focus returns to the switcher", async ({ api, page, person }) => {
  const workspace = await api.createWorkspace({ name: "Sheet focus" });
  await addDocument(person, workspace.run_id);
  await page.goto(`/studio/workspaces/${workspace.id}`);
  await expectWorkingScreen(page);
  const switcher = page
    .getByRole("group", { name: "Document" })
    .getByRole("button", { name: /^Document: / });
  const sheet = await openDocumentsSheet(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(switcher).toBeFocused();
});
