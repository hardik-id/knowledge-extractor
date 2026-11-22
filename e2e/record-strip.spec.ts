import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { projectWithDocuments, saveConfiguration } from "./pages/extraction";
import { RecordStripPage } from "./pages/record-strip";
import { scrollsSideways } from "./pages/studio";
import { documentPane, fieldColumn, openOneScreen } from "./pages/workspace";
import { expectAccessible } from "./support/accessibility";

const DOCUMENTS = ["platform-adrs.md"];
const FIRST = "Use feature flags for risky releases";
const SECOND = "Move build agents to spot instances";
const THIRD = "Standardise on TypeScript for new services";

type Expect = (e: { status: number; method?: string; path?: RegExp }) => void;

/** Before its first run a document has no extraction, and the backend answers 404 for it. */
function noExtractionYet(expectApiError: Expect) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

/** Selects the text of the list item that has it in the rendered document, as a person drags over it. */
async function selectInDocument(page: Page, text: string) {
  const item = documentPane(page).getByRole("listitem").filter({ hasText: text }).last();
  await item.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await item.dispatchEvent("mouseup");
}

test("the strip is absent before a run", async ({ api, expectApiError, page, person, request }) => {
  noExtractionYet(expectApiError);
  const project = await projectWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, project);
  await expect(documentPane(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Found in this record" })).toHaveCount(0);
});

test("accept a record, reject a value through its highlight, accept all suggested", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  await expect(strip.strip).toBeVisible();
  await expect(strip.position).toHaveText("Record 1 of 3");
  await expect(strip.strip.getByText("Suggested", { exact: true }).first()).toBeVisible();
  // The values are not listed in the right column.
  await expect(fieldColumn(page).locator("[data-record-value]")).toHaveCount(0);

  // Accept this record.
  await strip.recordButton("Accept").click();
  await expect(strip.strip.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await expect(strip.recordButton("Undo")).toBeVisible();

  // Next record: the second one. Reject one value through its highlight.
  await strip.next.click();
  await expect(strip.position).toHaveText("Record 2 of 3");
  const secondId = await documentPane(page)
    .getByRole("button", { name: `Title: ${SECOND}` })
    .getAttribute("data-record-id");
  const approver = documentPane(page).locator(
    `mark[data-record-id="${secondId}"][aria-label="Approved by: P. Bakker"]`,
  );
  const menu = await strip.openMenu("Approved by", approver);
  await expect(menu.getByText("P. Bakker")).toBeVisible();
  await menu.getByRole("button", { name: "Reject Approved by value" }).click();
  await expect(menu).toHaveCount(0);
  // The record stays suggested; a rejected value is no longer highlighted.
  await expect(strip.recordButton("Accept")).toBeVisible();
  await expect(approver).toHaveCount(0);

  // Accept all that is still suggested, from the list of records.
  const list = await strip.openList();
  await expect(list.getByRole("button", { name: new RegExp(SECOND) })).toBeVisible();
  await expect(list.getByRole("button", { name: new RegExp(THIRD) })).toBeVisible();
  await list.getByRole("button", { name: "Accept all suggested" }).click();
  await expect(list.getByText("Suggested", { exact: true })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  await list.getByRole("button", { name: new RegExp(FIRST) }).click();
  await expect(strip.position).toHaveText("Record 1 of 3");
  // The rejected value is still rejected.
  await expect(approver).toHaveCount(0);
});

test("a worked-out value is corrected on its line", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  const line = strip.line("Decided on");
  await expect(line).toBeVisible();
  await line.getByRole("button", { name: "Edit Decided on value" }).click();
  const input = line.getByLabel("Decided on value", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("2026-11-02");
  await page.keyboard.press("Enter");
  await expect(line.getByText("2026-11-02")).toBeVisible();
  await expect(line.getByText("Edited by you")).toBeVisible();

  // Rejecting it on the line keeps it, shown as rejected (not as "not found").
  await line.getByRole("button", { name: "Reject Decided on value" }).click();
  await expect(line.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(strip.strip.getByText(/^Not found:.*Decided on/)).toHaveCount(0);
});

test("text selected in the document is added to a field of the current record", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  await strip.next.click();
  await strip.next.click();
  await expect(strip.position).toHaveText("Record 3 of 3");
  await selectInDocument(page, "A starter template is needed");
  const menu = page.getByRole("dialog", { name: /Selected text/ });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Approved by" }).click();
  await expect(menu).toHaveCount(0);
  await expect(
    documentPane(page).getByRole("button", { name: /^Approved by: .*starter template/ }),
  ).toBeVisible();
});

test("a reviewed record survives a run with another configuration version", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip, extraction } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  await expect(strip.strip.getByText("Fields changed since this run")).toHaveCount(0);
  await strip.recordButton("Accept").click();
  await strip.next.click();
  await strip.recordButton("Reject").click();
  await expect(strip.recordButton("Undo")).toBeVisible();

  // Another configuration version: a field renamed, saved with a note.
  await fieldColumn(page).getByRole("textbox", { name: "Name of field 1" }).fill("Heading");
  await saveConfiguration(page, "Renamed");
  await expect(page.getByTestId("version-line")).toContainText("Version 2");
  await expect(strip.strip.getByText("Fields changed since this run")).toBeVisible();

  await extraction.run();
  await extraction.finished();
  await expect(strip.strip.getByText("Fields changed since this run")).toHaveCount(0);
  await expect(strip.position).toBeVisible();
  const list = await strip.openList();
  await expect(list.getByText("Accepted", { exact: true })).toHaveCount(1);
  await expect(list.getByText("Rejected", { exact: true })).toHaveCount(1);
  await expect(list.getByText("Suggested", { exact: true })).toHaveCount(1);
});

test("value actions work by keyboard: Enter opens the menu, Esc puts it away and returns focus", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  const mark = strip.highlights("Title").first();
  await mark.focus();
  await page.keyboard.press("Enter");
  const menu = strip.menu("Title");
  await expect(menu).toBeVisible();
  await expect(menu.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(mark).toBeFocused();

  // Accept by keyboard: Tab to the button, Enter. The menu closes and focus returns.
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Accept Title value" }).focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(mark).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu.getByText("Accepted", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // The strip's own buttons are reached with Tab and have names.
  await expect(strip.previous).toBeDisabled();
  await strip.next.focus();
  await page.keyboard.press("Enter");
  await expect(strip.position).toHaveText("Record 2 of 3");
  await expect(strip.previous).toBeEnabled();
});

test("the margin line follows previous and next", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  const { strip } = await RecordStripPage.openWithResults(
    page,
    api,
    person,
    request,
    DOCUMENTS,
    expectApiError,
  );
  const line = documentPane(page).getByTestId("record-margin-line");
  await expect(line).toBeVisible();
  const before = await line.evaluate((el) => (el as HTMLElement).style.top);
  await strip.next.click();
  await expect.poll(() => line.evaluate((el) => (el as HTMLElement).style.top)).not.toBe(before);
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("the strip fits and does not hide the document", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      const { strip } = await RecordStripPage.openWithResults(
        page,
        api,
        person,
        request,
        DOCUMENTS,
        expectApiError,
      );
      await expect(strip.strip).toBeVisible();
      expect(await scrollsSideways(page)).toBe(false);
      const box = await strip.strip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
      if (size.width >= 1100) {
        // Pinned inside the window, leaving at least half of it to the document.
        expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
        expect(box!.height).toBeLessThanOrEqual(size.height / 2);
      }
      const mark = documentPane(page).locator("mark").first();
      await mark.scrollIntoViewIfNeeded();
      const markBox = await mark.boundingBox();
      expect(markBox).not.toBeNull();
      if (size.width >= 1100) expect(markBox!.y + markBox!.height).toBeLessThanOrEqual(box!.y);
      // Its record's last button is inside the strip.
      const reject = await strip.recordButton("Reject").boundingBox();
      expect(reject && reject.x + reject.width <= size.width + 1).toBe(true);
    });
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the strip and a value menu have no violations", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      const { strip } = await RecordStripPage.openWithResults(
        page,
        api,
        person,
        request,
        DOCUMENTS,
        expectApiError,
      );
      await expect(strip.line("Decided on")).toBeVisible();
      await expectAccessible(page, `record strip (${scheme})`);
      await strip.openMenu("Title");
      await expectAccessible(page, `value menu (${scheme})`);
    });
  });
}
