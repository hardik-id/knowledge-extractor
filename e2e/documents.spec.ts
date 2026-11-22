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
  const project = await api.createProject({ name: "Sheet project" });
  await addDocument(person, project.run_id);
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByRole("tab", { name: "Define" })).toBeVisible();

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
  const project = await api.createProject({ name: "Cancelled sheet" });
  await addDocument(person, project.run_id);
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByRole("tab", { name: "Define" })).toBeVisible();

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
  const project = await api.createProject({ name: "Reviewed removal" });
  await addDocument(person, project.run_id);
  await page.goto(`/studio/projects/${project.id}`);
  const extraction = new ExtractionPage(page);
  await expect(extraction.tab("Define")).toBeVisible();
  await extraction.run("Run extraction");
  await extraction.finished();
  await extraction.openTab("Review");
  await page.getByRole("button", { name: "Accept all suggested" }).click();
  await expect(page.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);

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

test("the sheet is accessible and does not scroll the page sideways", async ({
  api,
  page,
  person,
}) => {
  const project = await api.createProject({ name: "Sheet scan" });
  await addDocument(person, project.run_id);
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByRole("tab", { name: "Define" })).toBeVisible();
  const sheet = await openDocumentsSheet(page);
  await expect(sheet.getByRole("checkbox", { name: DOCS.roadmap })).toBeVisible();
  await expectAccessible(page, "Documents sheet");
  expect(await scrollsSideways(page), "the page scrolls sideways").toBe(false);
});
