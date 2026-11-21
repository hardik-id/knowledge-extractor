import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";

const DOCUMENT = "platform-adrs.md";
const FIRST = "Use feature flags for risky releases";
const SECOND = "Move build agents to spot instances";
const THIRD = "Standardise on TypeScript for new services";

/** A project with one document, extracted and open on its Review tab. */
async function reviewing(
  page: Page,
  setup: Parameters<typeof projectWithDocuments>,
): Promise<ExtractionPage> {
  const project = await projectWithDocuments(...setup);
  const extraction = new ExtractionPage(page);
  await extraction.open(project);
  await extraction.run("Run extraction");
  await extraction.finished();
  await extraction.openTab("Review");
  await expect(extraction.record(FIRST)).toBeVisible();
  return extraction;
}

test("review: accept a record, reject a value, accept all, add a value, read the output", async ({
  api,
  context,
  page,
  person,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const extraction = await reviewing(page, [api, person, request, [DOCUMENT]]);
  await expect(extraction.summary()).toHaveText("3 records · 3 suggested");

  // Accept one record.
  await extraction
    .record(FIRST)
    .getByRole("button", { name: "Accept", exact: true })
    .first()
    .click();
  await expect(extraction.summary()).toHaveText("3 records · 1 accepted · 2 suggested");

  // Reject one value of another record: the record stays suggested.
  const second = extraction.record(SECOND);
  const approver = second
    .getByText("L. Visser")
    .locator("xpath=ancestor::div[contains(@class,'group/value')]");
  await approver.hover();
  await approver.getByRole("button", { name: "Reject" }).click();
  await expect(approver.getByText("Rejected")).toBeVisible();
  await expect(extraction.summary()).toHaveText("3 records · 1 accepted · 2 suggested");

  // Accept all that is still suggested.
  await page.getByRole("button", { name: "Accept all suggested" }).click();
  await expect(extraction.summary()).toHaveText("3 records · 3 accepted");
  await expect(page.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  // The rejected value is still rejected.
  await expect(approver.getByText("Rejected")).toBeVisible();

  // Add a value by selecting text in the document: it goes to the third record's field.
  await extraction.record(THIRD).getByRole("heading", { level: 4 }).getByRole("button").click();
  await selectInDocument(page, "A starter template is needed");
  const menu = page.getByRole("dialog", { name: /Selected text/ });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Approved by" }).click();
  await expect(extraction.record(THIRD).getByText("A starter template is needed")).toBeVisible();
  await expect(menu).toHaveCount(0);

  // The output: Markdown with the accepted values, and Copy puts it on the clipboard.
  await extraction.openTab("Output");
  await expect(page.getByText("Output as Markdown")).toBeVisible();
  const output = page.getByLabel("Markdown output");
  await expect(output).toContainText(`## ${FIRST}`);
  await expect(output).toContainText("**Status:** accepted");
  await expect(output).toContainText("P. Bakker");
  await expect(output).not.toContainText("L. Visser");
  await expect(output).toContainText("A starter template is needed");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Copied to the clipboard")).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(await output.innerText());
});

/** Selects the text of the list item that has it in the rendered document, as a person drags over it. */
async function selectInDocument(page: Page, text: string) {
  const item = page.getByRole("listitem").filter({ hasText: text }).last();
  await item.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await item.dispatchEvent("mouseup");
}

test("a reviewed record survives a run again with another configuration version", async ({
  api,
  page,
  person,
  request,
}) => {
  const extraction = await reviewing(page, [api, person, request, [DOCUMENT]]);
  await extraction
    .record(FIRST)
    .getByRole("button", { name: "Accept", exact: true })
    .first()
    .click();
  await extraction
    .record(SECOND)
    .getByRole("button", { name: "Reject", exact: true })
    .first()
    .click();
  await expect(extraction.summary()).toHaveText(
    "3 records · 1 accepted · 1 suggested · 1 rejected",
  );

  // Another configuration version: a new field, saved with a note.
  await extraction.openTab("Define");
  await extraction.ask("add a field for the reviewer");
  await page.getByRole("button", { name: "Apply" }).click();
  await extraction.saveConfiguration("With a reviewer");
  await expect(page.getByTestId("version-line")).toContainText("Version 2");

  await extraction.run("Run again");
  await extraction.finished();
  await extraction.openTab("Review");
  await expect(extraction.summary()).toHaveText(
    "3 records · 1 accepted · 1 suggested · 1 rejected",
  );
  await expect(
    extraction.record(FIRST).getByText("Accepted", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    extraction.record(SECOND).getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();
});

test("a record with six values fits one screen and its value actions work by keyboard", async ({
  api,
  page,
  person,
  request,
}) => {
  const extraction = await reviewing(page, [api, person, request, [DOCUMENT]]);
  const record = extraction.record(FIRST);
  const values = record.locator("[data-record-value]");
  await expect(values).toHaveCount(6);
  const box = await record.boundingBox();
  expect(box!.height, "one ADR record with six values").toBeLessThan(450);

  // Where a value came from is an icon with a name, not a line of its own.
  await expect(values.nth(0).getByRole("img", { name: /^Quote:/ })).toBeVisible();
  await expect(values.nth(1).getByRole("img", { name: /^Inferred:/ })).toBeVisible();

  // The actions appear when the keyboard reaches them.
  const decided = values.nth(2);
  const edit = decided.getByRole("button", { name: "Edit Decided on value" });
  await edit.focus();
  await expect(edit).toBeVisible();
  await expect(decided.getByRole("group", { name: "Actions for Decided on value" })).toHaveCSS(
    "opacity",
    "1",
  );

  // Edit with the keyboard: Enter opens the editor, Enter saves.
  await page.keyboard.press("Enter");
  const input = decided.getByLabel("Decided on value", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("2026-11-02");
  await page.keyboard.press("Enter");
  await expect(decided.getByText("2026-11-02")).toBeVisible();
  await expect(decided.getByText("Edited by you")).toBeVisible();

  // Reject one value, then remove another.
  await decided.getByRole("button", { name: "Reject Decided on value" }).focus();
  await page.keyboard.press("Enter");
  await expect(decided.getByText("Rejected", { exact: true })).toBeVisible();
  await values.nth(3).getByRole("button", { name: "Remove Approved by value" }).focus();
  await page.keyboard.press("Enter");
  await expect(record.locator("[data-record-value]")).toHaveCount(5);
});
