import { expect, test } from "./fixtures";
import { ExtractionPage, workspaceWithDocuments, saveConfiguration } from "./pages/extraction";
import { openFields } from "./pages/working-screen";

const DOCUMENTS = ["platform-adrs.md"];

const names = (page: import("@playwright/test").Page) =>
  page
    .getByRole("textbox", { name: /^Name of field/ })
    .evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value));

// The same checks as when the fields were their own tab, now on the table in the column.
test("the fields of a record type are one table, and every change survives a reload", async ({
  api,
  page,
  person,
  request,
}) => {
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  const extraction = new ExtractionPage(page);
  await extraction.open(workspace);

  await expect(page.getByRole("table", { name: "Fields of ADR" })).toBeVisible();
  await expect(await names(page)).toEqual([
    "Title",
    "Status",
    "Decided on",
    "Approved by",
    "Context",
    "Decision",
  ]);
  // A saved configuration opens with the right boxes ticked.
  await expect(page.getByRole("checkbox", { name: "Exact quote for Title" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Exact quote for Status" })).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Several values for Approved by" }),
  ).toBeChecked();

  // Add a field and name it.
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByRole("textbox", { name: "Name of field 7" }).fill("Owner");

  // Tick the boxes.
  await page.getByRole("checkbox", { name: "Exact quote for Status" }).check();
  await page.getByRole("checkbox", { name: "Several values for Status" }).check();

  // Choice, with allowed values.
  await page.getByLabel("Type of Decided on").selectOption("choice");
  await page.getByLabel("Allowed values for Decided on").fill("early, late");

  // Edit a key from the row's menu.
  await page.getByRole("button", { name: "More actions for Owner" }).click();
  await page.getByRole("menuitem", { name: "Edit key" }).click();
  const key = page.getByRole("textbox", { name: "Key for Owner" });
  await expect(key).toBeFocused();
  await key.fill("owner_of_it");

  // Move it up, remove another.
  await page.getByRole("button", { name: "More actions for Owner" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await page.getByRole("button", { name: "More actions for Context" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(await names(page)).toEqual([
    "Title",
    "Status",
    "Decided on",
    "Approved by",
    "Owner",
    "Decision",
  ]);

  await extraction.saveConfiguration("Table edits");
  await page.reload();
  await expect(page.getByRole("table", { name: "Fields of ADR" })).toBeVisible();

  await expect(await names(page)).toEqual([
    "Title",
    "Status",
    "Decided on",
    "Approved by",
    "Owner",
    "Decision",
  ]);
  await expect(page.getByRole("checkbox", { name: "Exact quote for Status" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Several values for Status" })).toBeChecked();
  await expect(page.getByLabel("Type of Decided on")).toHaveValue("choice");
  await expect(page.getByLabel("Allowed values for Decided on")).toHaveValue("early, late");
  // A key edited by hand shows by itself.
  await expect(page.getByRole("textbox", { name: "Key for Owner" })).toHaveValue("owner_of_it");
});

test("a field without a name shows its message in its row", async ({
  api,
  page,
  person,
  request,
}) => {
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  const extraction = new ExtractionPage(page);
  await extraction.open(workspace);

  await page.getByRole("button", { name: "Add field" }).click();
  await saveConfiguration(page);
  const row = page.getByRole("row").filter({ has: page.getByLabel("Name of field 7") });
  await expect(row.getByText("Give this field a name.")).toBeVisible();
  await expect(page.getByLabel("Name of field 7")).toHaveAccessibleDescription(
    "Give this field a name.",
  );
});

test("the row menu opens and closes with the keyboard", async ({ api, page, person, request }) => {
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await new ExtractionPage(page).open(workspace);

  const trigger = page.getByRole("button", { name: "More actions for Title" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Move down" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Move down" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("at 390px wide there is no sideways scroll and the controls can be reached", async ({
  api,
  page,
  person,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await new ExtractionPage(page).open(workspace);
  await openFields(page);
  const box = page.getByRole("checkbox", { name: "Several values for Decision" });
  await box.scrollIntoViewIfNeeded();
  await expect(box).toBeVisible();
  await expect(page.getByRole("button", { name: "More actions for Decision" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 1360, height: 900 },
]) {
  test(`at ${size.width} x ${size.height} the fields are a table with column headers`, async ({
    api,
    page,
    person,
    request,
  }) => {
    await page.setViewportSize(size);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    await new ExtractionPage(page).open(workspace);
    const table = page.getByRole("table", { name: "Fields of ADR" });
    for (const header of ["Field", "Type", "Exact quote", "Several values"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    const row = await table.getByRole("row").nth(1).boundingBox();
    expect(row?.height).toBeLessThanOrEqual(80);
  });
}

test("at 390px wide the column headers are not shown", async ({ api, page, person, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await new ExtractionPage(page).open(workspace);
  await openFields(page);
  const table = page.getByRole("table", { name: "Fields of ADR" });
  // Below a table's width the header is only for screen readers: the head is clipped to a point.
  const head = await table.locator("thead").boundingBox();
  expect(head?.width).toBeLessThanOrEqual(1);
});
