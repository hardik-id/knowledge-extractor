import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, workspaceWithDocuments } from "./pages/extraction";
import { scrollsSideways } from "./pages/studio";
import { documentPane, fieldColumn, openOneScreen } from "./pages/working-screen";
import { expectAccessible } from "./support/accessibility";

const DOCUMENTS = ["platform-adrs.md"];

/**
 * Before its first run a document has no extraction, and the backend answers 404 for it: the
 * screen shows no records. Every test here opens the screen before a run, so each expects it.
 */
function noExtractionYet(
  expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

/** A workspace with a document, its extraction run, and the working screen open. */
async function openWithResults(
  page: Page,
  api: Parameters<typeof workspaceWithDocuments>[0],
  person: Parameters<typeof workspaceWithDocuments>[1],
  request: Parameters<typeof workspaceWithDocuments>[2],
  options?: Parameters<typeof openOneScreen>[2],
) {
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  const extraction = new ExtractionPage(page);
  await openOneScreen(page, workspace, options);
  await extraction.run("Run extraction");
  await extraction.finished();
  await expect(documentPane(page).locator("mark").first()).toBeVisible();
  return { workspace, extraction };
}

test("the table is today's table, and its edits survive a save and a reload", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  const extraction = new ExtractionPage(page);
  await openOneScreen(page, workspace);

  const column = fieldColumn(page);
  await expect(column.getByRole("table", { name: "Fields of ADR" })).toBeVisible();
  await expect(
    column.getByRole("columnheader", { name: "Field and what to look for" }),
  ).toBeVisible();
  await expect(
    column.getByRole("columnheader", { name: "What to look for", exact: true }),
  ).toHaveCount(0);
  await expect(column.getByRole("heading", { name: "ADR" })).toBeVisible();
  await expect(column.getByText("6 fields", { exact: true })).toBeVisible();
  await expect(column.getByTestId("field-dot")).toHaveCount(6);

  await column.getByRole("textbox", { name: "Name of field 1" }).fill("Heading");
  await column.getByRole("checkbox", { name: "Several values for Status" }).check();
  await column.getByLabel("Type of Decided on").selectOption("number");
  await column.getByRole("button", { name: "More actions for Context" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(column.getByText("5 fields", { exact: true })).toBeVisible();
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();

  await extraction.saveConfiguration("Edited on the working screen");
  await page.reload();
  await openOneScreen(page, workspace);

  const again = fieldColumn(page);
  await expect(again.getByRole("textbox", { name: "Name of field 1" })).toHaveValue("Heading");
  await expect(again.getByRole("checkbox", { name: "Several values for Status" })).toBeChecked();
  await expect(again.getByLabel("Type of Decided on")).toHaveValue("number");
  await expect(again.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(5);
  await expect(again.getByRole("textbox", { name: /^Name of field/ }).last()).toHaveValue(
    "Decision",
  );
});

test("highlights show with no chips and no legend, and hovering one names its field", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  await openWithResults(page, api, person, request);
  const document = documentPane(page);

  await expect(document.getByRole("list", { name: "Labels" })).toHaveCount(0);
  // A chip is an aria-hidden span inside the mark.
  await expect(document.locator("mark span[aria-hidden='true']")).toHaveCount(0);

  const title = document.getByRole("button", { name: /^Title: / }).first();
  await title.hover();
  await expect(title).toHaveAttribute("title", "Title");
  await expect(title).toHaveAttribute("data-record-id", /.+/);
  // The current record is the first one: its part of the document has a line in the margin.
  await expect(document.getByTestId("record-margin-line")).toBeVisible();
});

test("a click on a highlight of another record moves the margin line to that record", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  await openWithResults(page, api, person, request);
  const document = documentPane(page);
  const line = document.getByTestId("record-margin-line");
  await expect(line).toBeVisible();
  const firstId = await document.locator("mark").first().getAttribute("data-record-id");
  const other = document.locator(`mark:not([data-record-id="${firstId}"])`).first();
  await expect(other).toBeVisible();
  const before = await line.evaluate((el) => (el as HTMLElement).style.top);
  await other.click();
  await expect.poll(() => line.evaluate((el) => (el as HTMLElement).style.top)).not.toBe(before);
  // Esc puts the open highlight away.
  await page.keyboard.press("Escape");
});

test("Output shows the output of the document, in the format chosen", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  await openWithResults(page, api, person, request);
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByText(/^Output as (JSON|CSV|Markdown)$/)).toBeVisible();
  await page.getByText("Markdown", { exact: true }).click();
  await expect(page.getByText("Output as Markdown")).toBeVisible();
  await expect(page.getByLabel("Template for one record")).toBeVisible();
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await expect(documentPane(page).locator("mark").first()).toBeVisible();
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("the 560px column holds the whole table with no sideways scroll", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      await openOneScreen(page, workspace);
      const column = fieldColumn(page);
      await expect(column.getByRole("table")).toBeVisible();
      expect(await scrollsSideways(page)).toBe(false);
      const box = await column.boundingBox();
      expect(box?.width).toBeCloseTo(560, 0);
      expect(await column.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
      // The last control of the last row is inside the column.
      const last = await column
        .getByRole("button", { name: "More actions for Decision" })
        .boundingBox();
      expect(last && box && last.x + last.width <= box.x + box.width).toBe(true);
      await expect(
        page
          .getByRole("main", { name: "Document" })
          .getByRole("button", { name: "Assistant", exact: true }),
      ).toHaveCount(0);
    });
  });
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("the column is an overlay opened by the Fields button", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      await openOneScreen(page, workspace);
      await expect(fieldColumn(page)).toHaveCount(0);
      expect(await scrollsSideways(page)).toBe(false);

      await page
        .getByRole("main", { name: "Document" })
        .getByRole("button", { name: "Assistant", exact: true })
        .click();
      const sheet = page.getByRole("dialog", { name: "Assistant" });
      await expect(sheet.getByRole("table", { name: "Fields of ADR" })).toBeVisible();
      expect(await scrollsSideways(page)).toBe(false);
      // It slides in: wait until it has settled inside the window.
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox();
          return !!box && box.x >= 0 && Math.round(box.x + box.width) <= size.width;
        })
        .toBe(true);
      expect(await sheet.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);

      await sheet.getByRole("textbox", { name: "Name of field 1" }).fill("Heading");
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(
        page
          .getByRole("main", { name: "Document" })
          .getByRole("button", { name: "Assistant", exact: true }),
      ).toBeFocused();
      // The edit is in the draft, whichever way the column is shown.
      await expect(page.getByText("Unsaved changes").first()).toBeVisible();
    });
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the working screen has no violations and one orange action", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      // Before the first run Run is the one orange action; after it, it is a secondary button.
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      const extraction = new ExtractionPage(page);
      await openOneScreen(page, workspace);
      await expect(page.locator('button[data-variant="default"]:visible')).toHaveCount(1);
      await extraction.run("Run extraction");
      await extraction.finished();
      await expect(documentPane(page).locator("mark").first()).toBeVisible();
      await expectAccessible(page, `working screen (${scheme})`);
    });
  });
}

test.describe("pictures", () => {
  test.use({ colorScheme: "light", reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" });

  /** The same masks as visual.spec.ts: dates, the version line, the backend status badge (its word depends on the stack) and the dev server's own badge. */
  async function shot(page: Page, name: string) {
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(name, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.002,
      mask: [
        page.locator("time"),
        page.getByTestId("version-line"),
        page.locator("nextjs-portal"),
        page.getByTestId("status-badge"),
      ],
    });
  }

  test("the working screen with highlights at 1440x900", async ({
    api,
    page,
    person,
    request,
    expectApiError,
  }) => {
    noExtractionYet(expectApiError);
    await page.setViewportSize({ width: 1440, height: 900 });
    // The first-visit screen: Configuration closed, the assistant open.
    await openWithResults(page, api, person, request, { configuration: "closed" });
    await shot(page, "one-screen.png");
  });

  test("the field column as an overlay at 390x844", async ({
    api,
    page,
    person,
    request,
    expectApiError,
  }) => {
    noExtractionYet(expectApiError);
    await page.setViewportSize({ width: 390, height: 844 });
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    await openOneScreen(page, workspace, { configuration: "closed" });
    await page
      .getByRole("main", { name: "Document" })
      .getByRole("button", { name: "Assistant", exact: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Assistant" });
    await expect(sheet.getByRole("button", { name: /^Configuration/ })).toBeVisible();
    await expect(sheet.getByRole("textbox", { name: "Ask the assistant" })).toBeVisible();
    await shot(page, "one-screen-overlay.png");
  });
});
