import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { documentPane, fieldColumn, openOneScreen } from "./pages/workspace";
import { scrollsSideways } from "./pages/studio";
import { expectAccessible } from "./support/accessibility";

const DOCUMENTS = ["platform-adrs.md"];

/** Before a first run the backend answers 404 for the document's extraction: the screen shows no records. */
function noExtractionYet(
  expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

test.describe("the assistant in the column", () => {
  test("a proposal shows in the table; Keep all makes it a row, Discard all removes it", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    const column = fieldColumn(page);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");

    // One line to ask with; the conversation is closed until it is used.
    await expect(dock.conversation).toHaveCount(0);
    await dock.ask("add a field for the approver");
    await expect(dock.bar).toContainText("suggested change");
    await expect(dock.newFieldRows).toHaveCount(1);
    await expect(dock.newFieldRows.first()).toContainText("Approver");
    await expect(dock.conversation.getByText("Waiting for you")).toBeVisible();

    // Nothing changes until it is kept.
    await expect(column.getByRole("button", { name: "More actions for Approver" })).toHaveCount(0);
    await dock.bar.getByRole("button", { name: "Keep all" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(dock.newFieldRows).toHaveCount(0);
    await expect(column.getByRole("button", { name: "More actions for Approver" })).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
    await expect(dock.conversation.getByText("Kept", { exact: true })).toBeVisible();

    // A second proposal, discarded.
    await dock.ask("make the status exact text");
    await expect(dock.bar).toBeVisible();
    await dock.bar.getByRole("button", { name: "Discard all" }).click();
    await expect(dock.bar).toHaveCount(0);
    await expect(dock.conversation.getByText("Discarded")).toBeVisible();
  });

  test("a change to an existing field is a line under its row, and Keep all applies it", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    await dock.ask("make the status exact text");
    await expect(dock.bar).toContainText("suggested change");
    const line = dock.column.getByRole("listitem").filter({ hasText: /^Change\b/ });
    await expect(line.first()).toBeVisible();
    await expect(line.first()).toBeInViewport();
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");
    await dock.bar.getByRole("button", { name: "Keep all" }).click();
    await expect(line).toHaveCount(0);
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
    // The decision is said, and the cursor is back in the input.
    await expect(dock.column.getByRole("status")).toContainText(/Kept \d+ change/);
    await expect(dock.input).toBeFocused();
  });

  test("a suggested field shows even when the record type has no fields", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    const column = fieldColumn(page);
    const more = column.getByRole("button", { name: /^More actions for / });
    await expect(more.first()).toBeVisible();
    for (let left = await more.count(); left > 0; left--) {
      await more.first().click();
      await page.getByRole("menuitem", { name: "Remove" }).click();
      await expect(more).toHaveCount(left - 1);
    }
    await expect(column.getByText("No fields. A record is then just")).toBeVisible();
    await dock.ask("add a field for the approver");
    await expect(dock.bar).toContainText("suggested change");
    await expect(dock.newFieldRows).toHaveCount(1);
    await expect(dock.newFieldRows.first()).toContainText("Approver");
  });

  test("Discard all leaves the table as it was", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows).toHaveCount(1);
    await dock.bar.getByRole("button", { name: "Discard all" }).click();
    await expect(dock.newFieldRows).toHaveCount(0);
    await expect(
      fieldColumn(page).getByRole("button", { name: "More actions for Approver" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");
  });

  test("clearing the conversation keeps the configuration", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    await dock.ask("add a field for the approver");
    await dock.bar.getByRole("button", { name: "Keep all" }).click();

    await dock.clear();
    await expect(dock.conversation.getByText("add a field for the approver")).toHaveCount(0);
    await expect(
      fieldColumn(page).getByRole("button", { name: "More actions for Approver" }),
    ).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
  });

  test("the conversation is still there after a reload", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows).toHaveCount(1);

    await page.reload();
    await openOneScreen(page, project);
    // Tabbing into the input leaves the conversation closed; a click opens it.
    await dock.input.click();
    await expect(dock.conversation.getByText("add a field for the approver")).toBeVisible();
    await expect(dock.newFieldRows).toHaveCount(1);
  });

  test("has no accessibility violations with a proposal showing", async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await openOneScreen(page, project);
    // After a run, the document has highlights: the screen as it is used.
    const extraction = new ExtractionPage(page);
    await extraction.run("Run extraction");
    await extraction.finished();
    await expect(documentPane(page).locator("mark").first()).toBeVisible();
    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows).toHaveCount(1);
    await expectAccessible(page, "working screen with a proposal");
  });

  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`a proposal fits the screen at ${size.width}x${size.height}`, async ({
      api,
      expectApiError,
      page,
      person,
      request,
    }, testInfo) => {
      noExtractionYet(expectApiError);
      await page.setViewportSize(size);
      const project = await projectWithDocuments(api, person, request, DOCUMENTS);
      const dock = new AssistantDock(page);
      await openOneScreen(page, project);
      if (size.width < 1100)
        await page.getByRole("button", { name: "Fields", exact: true }).click();
      await dock.ask("add a field for the approver");
      await expect(dock.newFieldRows).toHaveCount(1);
      await expect(dock.input).toBeVisible();
      await expect(dock.newFieldRows.first()).toBeInViewport();
      expect(await scrollsSideways(page)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`dock-${size.width}.png`) });
    });
  }
});
