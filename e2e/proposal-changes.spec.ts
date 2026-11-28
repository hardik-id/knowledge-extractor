import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { ExtractionPage, workspaceWithDocuments } from "./pages/extraction";
import { openOneScreen } from "./pages/working-screen";
import { scrollsSideways } from "./pages/studio";
import { expectAccessible } from "./support/accessibility";

const DOCUMENTS = ["platform-adrs.md"];

/** Before a first run the backend answers 404 for the document's extraction: the screen shows no records. */
function noExtractionYet(
  expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

test.describe("keeping or discarding one change at a time", () => {
  test("keeping one of two changes leaves the other open", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.ask("add a field for the approver");
    await expect(dock.bar).toContainText("2 suggested changes");
    await expect(dock.conversation.getByText("Waiting for you")).toBeVisible();

    // Nothing is applied before the click.
    await expect(
      dock.column.getByRole("button", { name: "More actions for Approver" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");

    await dock.newFieldRows.first().getByRole("button", { name: "Keep" }).click();
    await expect(dock.newFieldRows).toHaveCount(0);
    await expect(
      dock.column.getByRole("button", { name: "More actions for Approver" }),
    ).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
    await expect(dock.bar).toContainText("1 suggested change");
    await expect(dock.bar).not.toContainText("2 suggested");
    await expect(dock.conversation.getByText("1 kept")).toBeVisible();
    await expect(dock.column.getByRole("status")).toContainText("Kept: ");
    // The change in the bar is still open, and has the focus.
    const template = dock.bar.getByRole("listitem").filter({ hasText: "Template changed" });
    await expect(template).toBeVisible();
    await expect(template.getByRole("button", { name: "Keep" })).toBeFocused();

    await template.getByRole("button", { name: "Discard" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(dock.conversation.getByText("1 kept, 1 discarded")).toBeVisible();
    await expect(dock.column.getByRole("status")).toContainText("Discarded: ");
    await expect(dock.input).toBeFocused();
  });

  test("a discarded change stays out while another is kept", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.ask("add a field for the approver");
    const template = dock.bar.getByRole("listitem").filter({ hasText: "Template changed" });
    await template.getByRole("button", { name: "Discard" }).click();
    await expect(dock.bar).toContainText("1 suggested change");
    await expect(template).toHaveCount(0);
    await dock.newFieldRows.first().getByRole("button", { name: "Keep" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(template).toHaveCount(0);
    await expect(dock.conversation.getByText("1 kept, 1 discarded")).toBeVisible();
    await expect(dock.input).toBeFocused();
  });

  test("a discarded new field is gone and changes nothing", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.ask("add a field for the approver");
    await dock.newFieldRows.first().getByRole("button", { name: "Discard" }).click();
    await expect(dock.newFieldRows).toHaveCount(0);
    await expect(dock.bar).toContainText("1 suggested change");
    await expect(
      dock.column.getByRole("button", { name: "More actions for Approver" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");
    // Keep all now applies only what is open.
    await dock.bar.getByRole("button", { name: "Keep all" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(
      dock.column.getByRole("button", { name: "More actions for Approver" }),
    ).toHaveCount(0);
    await expect(dock.conversation.getByText("1 kept, 1 discarded")).toBeVisible();
  });

  test("a change to a field is kept from its own line", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.ask("make the status exact text");
    const line = dock.changeLines.filter({ hasText: /^Change\b/ });
    await expect(line.first()).toBeVisible();
    await line.first().getByRole("button", { name: "Keep" }).click();
    await expect(line).toHaveCount(0);
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
    await expect(dock.conversation.getByText(/\d+ kept/)).toBeVisible();
  });

  test("a removal is kept with Keep removal", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    const fields = dock.column.getByRole("textbox", { name: /^Name of field/ });
    const before = await fields.count();
    await dock.ask("remove the title field");
    const line = dock.changeLines.filter({ hasText: /^Remove\b/ });
    await expect(line).toBeVisible();
    await expect(line.getByRole("button", { name: "Keep", exact: true })).toHaveCount(0);
    await line.getByRole("button", { name: "Keep removal" }).click();
    await expect(fields).toHaveCount(before - 1);
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
    await expect(dock.conversation.getByText(/\d+ kept/)).toBeVisible();
  });

  test("a suggested record type is kept or discarded from its heading", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    // Take the record type away first (the first click can be lost to a rebuild in dev).
    const remove = page.getByRole("menuitem", { name: "Remove record type" });
    await expect(async () => {
      if (!(await remove.isVisible()))
        await dock.column
          .getByRole("button", { name: "Record type options" })
          .click({ timeout: 2_000 });
      await expect(remove).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await remove.click();

    await dock.ask("extract the ADRs");
    const heading = dock.column.getByRole("table", { name: /New record type/ });
    await expect(heading).toBeVisible();
    // The type with its fields is one change: the fields have no buttons of their own.
    await expect(dock.newFieldRows.first().getByRole("button")).toHaveCount(0);
    await heading.getByRole("button", { name: "Keep" }).click();
    await expect(heading).toHaveCount(0);
    await expect(dock.column.getByRole("textbox", { name: /^Name of field/ })).toHaveCount(6);
    await expect(dock.bar).toContainText("1 suggested change");
  });

  test("the bar counts down and goes at zero", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.ask("add a field for the approver");
    await expect(dock.bar).toContainText("2 suggested changes");
    await dock.newFieldRows.first().getByRole("button", { name: "Discard" }).click();
    await expect(dock.bar).toContainText("1 suggested change");
    await dock.bar.getByRole("listitem").first().getByRole("button", { name: "Discard" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(dock.conversation.getByText("Discarded", { exact: true })).toBeVisible();
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");
  });

  test("works with the keyboard alone", async ({ api, expectApiError, page, person, request }) => {
    noExtractionYet(expectApiError);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, workspace);
    await dock.input.fill("add a field for the approver");
    await page.keyboard.press("Enter");
    await expect(dock.newFieldRows).toHaveCount(1);
    const keep = dock.newFieldRows.first().getByRole("button", { name: "Keep" });
    await keep.focus();
    await expect(keep).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dock.newFieldRows).toHaveCount(0);
    // The focus moved on to the next open change.
    const template = dock.bar.getByRole("listitem").filter({ hasText: "Template changed" });
    await expect(template.getByRole("button", { name: "Keep" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(template.getByRole("button", { name: "Discard" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dock.bar).toHaveCount(0);
    await expect(dock.input).toBeFocused();
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`the buttons fit the screen at ${size.width}x${size.height}`, async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      await page.setViewportSize(size);
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      const dock = new AssistantDock(page);
      await openOneScreen(page, workspace);
      if (size.width < 1100)
        await page
          .getByRole("main", { name: "Document" })
          .getByRole("button", { name: "Assistant", exact: true })
          .click();
      await dock.ask("add a field for the approver");
      const row = dock.newFieldRows.first();
      await expect(row.getByRole("button", { name: "Discard" })).toBeInViewport();
      expect(await scrollsSideways(page)).toBe(false);
    });
  }
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("a proposal with a Keep and Discard on each change has no violations", async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }) => {
      noExtractionYet(expectApiError);
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      const dock = new AssistantDock(page);
      await openOneScreen(page, workspace);
      // After a run, the document has highlights: the screen as it is used.
      const extraction = new ExtractionPage(page);
      await extraction.run("Run extraction");
      await extraction.finished();
      await dock.ask("add a field for the approver");
      await expect(dock.newFieldRows.first().getByRole("button", { name: "Keep" })).toBeVisible();
      await expectAccessible(page, `suggested changes (${scheme})`);
    });
  });
}
