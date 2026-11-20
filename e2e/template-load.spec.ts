import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import {
  DOCS,
  editPrompt,
  openExtraction,
  saveConfiguration,
  scrollsSideways,
} from "./pages/studio";
import { expectAccessible } from "./support/accessibility";
import { clickUntilOpen } from "./support/first-click";

const POLICY = "Policy rules";

/** Opens the Templates dialog on the Define tab and chooses a template (not yet used). */
async function openTemplates(page: Page, choose?: string) {
  const dialog = await clickUntilOpen(
    page,
    page.getByRole("button", { name: "Templates" }),
    page.getByRole("dialog", { name: "Templates" }),
  );
  if (choose) await dialog.getByRole("radio", { name: new RegExp(choose) }).check();
  return dialog;
}

async function useTemplate(page: Page, name: string) {
  const dialog = await openTemplates(page, name);
  await dialog.getByRole("button", { name: "Use this template" }).click();
  await expect(dialog).toHaveCount(0);
}

const fieldNames = (page: Page) =>
  page
    .getByRole("textbox", { name: /^Name of field/ })
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));

test("load a template: unsaved, discard brings the old one back, then save it with the note", async ({
  api,
  page,
}) => {
  const project = await api.createProject({ name: "Template project" });
  await openExtraction(page, project, [DOCS.roadmap]);
  await expect(page.getByRole("table", { name: "Fields of ADR" })).toBeVisible();

  await useTemplate(page, POLICY);
  await expect(page.getByRole("table", { name: "Fields of Rule" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Fields of ADR" })).toHaveCount(0);
  await expect((await fieldNames(page)).slice(0, 2)).toEqual(["Rule", "Kind"]);
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();

  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("table", { name: "Fields of ADR" })).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  await useTemplate(page, POLICY);
  await page.getByRole("button", { name: "Save configuration" }).click();
  const form = page.getByRole("form", { name: "Save configuration" });
  await expect(form.getByLabel("Note (optional)")).toHaveValue(`From template: ${POLICY}`);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("version-line")).toContainText("Version 2");

  await page.reload();
  await expect(page.getByRole("table", { name: "Fields of Rule" })).toBeVisible();
  await expect(page.getByTestId("version-line")).toContainText("Version 2");
  await page.getByRole("button", { name: "Version history" }).click();
  const versions = page
    .getByRole("dialog", { name: "Version history" })
    .getByRole("list", { name: "Versions" })
    .getByRole("listitem");
  await expect(versions.nth(0)).toContainText(`From template: ${POLICY}`);
  await expect(versions.nth(1)).toContainText("Version 1");
});

test("the dialog shows what the template brings, what would change, and that edits are replaced", async ({
  api,
  page,
}) => {
  const project = await api.createProject({ name: "Template dialog project" });
  await openExtraction(page, project, [DOCS.roadmap]);
  await editPrompt(page, "Something I typed");

  const dialog = await openTemplates(page);
  await expect(dialog.getByRole("button", { name: "Use this template" })).toBeDisabled();
  await dialog.getByRole("radio", { name: new RegExp(POLICY) }).check();
  const brings = dialog.getByRole("region", { name: "What it would bring" });
  await expect(brings.getByRole("listitem").filter({ hasText: /^Kind/ })).toBeVisible();
  await expect(brings.getByText("Output format:")).toBeVisible();
  await expect(brings.getByText("Record type removed: ADR")).toBeVisible();
  await expect(brings.getByText("Record type added: Rule")).toBeVisible();
  await expect(brings.getByText(/You have unsaved changes in the editor/)).toBeVisible();
  await expectAccessible(page, "templates dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("What to extract")).toHaveValue("Something I typed");
});

test("the same template twice changes nothing the second time", async ({ api, page }) => {
  const project = await api.createProject({ name: "Template twice project" });
  await openExtraction(page, project, [DOCS.roadmap]);
  await useTemplate(page, POLICY);

  const dialog = await openTemplates(page, POLICY);
  await expect(dialog.getByText("Already what you have")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Use this template" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Saved, and after a reload, it is still what the project has.
  await saveConfiguration(page);
  await expect(page.getByTestId("version-line")).toContainText("Version 2");
  await page.reload();
  const again = await openTemplates(page, POLICY);
  await expect(again.getByText("Already what you have")).toBeVisible();
});

test("with reviewed records, the dialog says what the next run does, and it does", async ({
  api,
  page,
  person,
  request,
}) => {
  const project = await projectWithDocuments(api, person, request, ["platform-adrs.md"]);
  const extraction = new ExtractionPage(page);
  await extraction.open(project);
  await extraction.run("Run extraction");
  await extraction.finished();
  await extraction.openTab("Review");
  const first = "Use feature flags for risky releases";
  await expect(extraction.record(first)).toBeVisible();
  await extraction
    .record(first)
    .getByRole("button", { name: "Accept", exact: true })
    .first()
    .click();
  await expect(extraction.summary()).toHaveText("3 records · 1 accepted · 2 suggested");

  await extraction.openTab("Define");
  const dialog = await openTemplates(page, POLICY);
  await expect(
    dialog.getByText(/1 record you reviewed or added belongs to a record type this template/),
  ).toBeVisible();
  await expect(dialog.getByText(/replaces the suggestions nobody has reviewed/)).toBeVisible();
  await dialog.getByRole("button", { name: "Use this template" }).click();

  await extraction.run("Run again");
  await extraction.finished();
  await extraction.openTab("Review");
  await extraction.document("platform-adrs.md").click();
  // The accepted record stays, without a record type; the two suggestions were replaced.
  await expect(extraction.summary()).toHaveText("1 record · 1 accepted");
});

test("the dialog fits a phone without sideways scroll", async ({ api, page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const project = await api.createProject({ name: "Template phone project" });
  await openExtraction(page, project, [DOCS.roadmap]);
  const dialog = await openTemplates(page, POLICY);
  await expect(dialog.getByText("Compared with the editor")).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const overflow = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(false);
});
