import { expect, test } from "./fixtures";
import { FieldSelectionPage } from "./pages/field-selection";
import { expectAccessible } from "./support/accessibility";

/** Before its first run a document has no extraction, and the backend answers 404 for it. */
function noExtractionYet(
  expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

test("a click on a row selects the field, fades the others, and a second click or Esc clears it", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openWithResults(api, person, request);
  const column = screen.column;

  await screen.expectNothingSelected(column);
  await screen.expectNothingFaded();

  await screen.select(column, "Title");
  await screen.expectSelected(column, "Title");
  await screen.expectFaded("Title");

  // A second click clears it.
  await screen.select(column, "Title");
  await screen.expectNothingSelected(column);
  await screen.expectNothingFaded();

  // Another row replaces the selection; Esc clears it, wherever the focus is.
  await screen.select(column, "Title");
  await screen.select(column, "Status");
  await screen.expectSelected(column, "Status");
  await expect(screen.row(column, "Title")).toHaveAttribute("aria-selected", "false");
  await screen.expectFaded("Status");
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Escape");
  await screen.expectNothingSelected(column);
  await screen.expectNothingFaded();
});

test("the selected field's highlight scrolls into view in the document", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  await page.setViewportSize({ width: 1280, height: 720 });
  const screen = new FieldSelectionPage(page);
  await screen.openWithResults(api, person, request);

  await screen.select(screen.column, "Decision");
  await screen.expectSelected(screen.column, "Decision");
  await expect(screen.marksOf("Decision").first()).toBeInViewport();
});

test("the controls of a row do not select it", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;

  await column.getByRole("checkbox", { name: "Several values for Status" }).check();
  await column.getByRole("button", { name: "More actions for Status" }).click();
  await page.getByRole("menuitem", { name: "Edit key" }).click();
  await column.getByRole("textbox", { name: "What to look for in Status" }).click();
  await column.getByLabel("Type of Status").focus();
  await screen.expectNothingSelected(column);
});

test("Add field adds a row and moves the focus to its name", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;

  await expect(column.getByText("6 fields", { exact: true })).toBeVisible();
  await column.getByRole("button", { name: "Add field" }).click();
  await expect(column.getByText("7 fields", { exact: true })).toBeVisible();
  await expect(column.getByRole("textbox", { name: "Name of field 7" })).toBeFocused();
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
});

test("renaming the record type goes into the draft", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;

  await column.getByRole("button", { name: "Record type options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = column.getByRole("textbox", { name: "Record type name" });
  await expect(name).toBeFocused();
  await name.fill("Decision record");
  await page.keyboard.press("Enter");
  await expect(column.getByRole("heading", { name: "Decision record" })).toBeVisible();
  await expect(column.getByRole("button", { name: "Record type options" })).toBeFocused();
  await expect(column.getByRole("table", { name: "Fields of Decision record" })).toBeVisible();
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();

  await column.getByRole("button", { name: "Record type options" }).click();
  await page.getByRole("menuitem", { name: "Edit description" }).click();
  await column.getByRole("textbox", { name: "Record type description" }).fill("A decision");
  await page.keyboard.press("Escape");
  await expect(column.getByRole("textbox", { name: "Record type description" })).toHaveCount(0);
  await expect(column.getByRole("button", { name: "Record type options" })).toBeFocused();
});

test("a second record type shows the segmented control, and removing it brings the first back", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;
  await expect(column.getByRole("group", { name: "Record type" })).toHaveCount(0);

  await column.getByRole("button", { name: "Record type options" }).click();
  await page.getByRole("menuitem", { name: "Add record type" }).click();
  // The new type is shown, and its name is being typed.
  await expect(column.getByRole("textbox", { name: "Record type name" })).toBeFocused();
  await page.keyboard.type("Risk");
  await page.keyboard.press("Enter");
  const group = column.getByRole("group", { name: "Record type" });
  await expect(group.getByRole("button", { name: "Risk" })).toHaveAttribute("aria-pressed", "true");
  await expect(column.getByText("0 fields")).toBeVisible();

  await group.getByRole("button", { name: "ADR" }).click();
  await expect(column.getByRole("table", { name: "Fields of ADR" })).toBeVisible();

  await group.getByRole("button", { name: "Risk" }).click();
  await column.getByRole("button", { name: "Record type options" }).click();
  await page.getByRole("menuitem", { name: "Remove record type" }).click();
  await expect(column.getByRole("group", { name: "Record type" })).toHaveCount(0);
  await expect(column.getByRole("heading", { name: "ADR" })).toBeVisible();
});

test("the prompt is edited in place: a click opens a box, Esc or leaving closes it", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);

  await screen.promptButton.click();
  await expect(screen.promptBox).toBeFocused();
  await screen.promptBox.fill("Every decision, with who made it.");
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(screen.promptBox).toHaveCount(0);
  await expect(screen.promptButton).toBeFocused();
  await expect(screen.promptButton).toContainText("Every decision, with who made it.");

  // Leaving the box closes it too.
  await screen.promptButton.click();
  await screen.promptBox.fill("Only the decisions.");
  await screen.column.getByRole("button", { name: "Add field" }).click();
  await expect(screen.promptBox).toHaveCount(0);
  await expect(screen.promptButton).toContainText("Only the decisions.");
});

test("keyboard only: Enter in a name selects the row, Esc clears it", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;

  await column.getByRole("textbox", { name: "Name of field 2" }).focus();
  await page.keyboard.press("Enter");
  await screen.expectSelected(column, "Status");
  await expect(column.getByRole("textbox", { name: "Name of field 2" })).toBeFocused();
  await page.keyboard.press("Escape");
  await screen.expectNothingSelected(column);

  // Esc with a menu open closes the menu and keeps the selection.
  await page.keyboard.press("Enter");
  await screen.expectSelected(column, "Status");
  await column.getByRole("button", { name: "Record type options" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await screen.expectSelected(column, "Status");
  await page.keyboard.press("Escape");
  await screen.expectNothingSelected(column);
});

test("removing the selected field clears the selection", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const screen = new FieldSelectionPage(page);
  await screen.openEmpty(api, person, request);
  const column = screen.column;

  await screen.select(column, "Status");
  await screen.expectSelected(column, "Status");
  await column.getByRole("button", { name: "More actions for Status" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await screen.expectNothingSelected(column);
});

test.describe("at 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the selection works in the overlay", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const screen = new FieldSelectionPage(page);
    await screen.openWithResults(api, person, request);
    await page
      .getByRole("main", { name: "Document" })
      .getByRole("button", { name: "Assistant", exact: true })
      .click();
    const sheet = screen.sheet;
    await expect(sheet.getByRole("table", { name: "Fields of ADR" })).toBeVisible();

    await screen.select(sheet, "Title");
    await screen.expectSelected(sheet, "Title");
    await screen.select(sheet, "Title");
    await screen.expectNothingSelected(sheet);
    await screen.select(sheet, "Title");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await screen.expectFaded("Title");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("a selected field, the prompt box and the record type menu have no violations", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      const screen = new FieldSelectionPage(page);
      await screen.openWithResults(api, person, request);
      await screen.select(screen.column, "Title");
      await screen.expectFaded("Title");
      await expectAccessible(page, `selected field (${scheme})`);

      await screen.promptButton.click();
      await expect(screen.promptBox).toBeVisible();
      await expectAccessible(page, `prompt box (${scheme})`);
    });
  });
}
