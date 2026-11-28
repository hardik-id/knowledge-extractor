import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { ExtractionPage, saveConfiguration, workspaceWithDocuments } from "./pages/extraction";
import { RecordStripPage } from "./pages/record-strip";
import { openStart } from "./pages/studio";
import {
  configurationRow,
  documentPane,
  expectWorkingScreen,
  fieldColumn,
  openConfiguration,
  openOneScreen,
} from "./pages/working-screen";

const DOCUMENTS = ["platform-adrs.md"];

function noExtractionYet(
  expectApiError: (e: { status: number; method?: string; path?: RegExp }) => void,
) {
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`at ${size.width} x ${size.height} Configuration is closed on a first visit and the assistant is open`, async ({
    api,
    expectApiError,
    page,
    person,
    request,
  }) => {
    noExtractionYet(expectApiError);
    await page.setViewportSize(size);
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    await openOneScreen(page, workspace, { configuration: "closed" });
    const row = configurationRow(page);
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await expect(row).toContainText(/\d+ fields? · Automatic chunking/);
    const dock = new AssistantDock(page);
    await expect(dock.input).toBeVisible();
    await expect(documentPane(page)).toBeVisible();
    // The document is on the left, the column on the right.
    const left = await documentPane(page).boundingBox();
    const right = await fieldColumn(page).boundingBox();
    expect(left!.x).toBeLessThan(right!.x);
    // No sideways scroll.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    // Open, the assistant keeps at least 240px and 40% of the column.
    await openConfiguration(page);
    const column = (await fieldColumn(page).boundingBox())!;
    const assistant = (await dock.dock.boundingBox())!;
    expect(assistant.height).toBeGreaterThanOrEqual(239);
    expect(assistant.height).toBeGreaterThanOrEqual(column.height * 0.4 - 1);
  });
}

test("open or closed is remembered for the next visit, in every workspace", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const first = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  const second = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, first, { configuration: "closed" });
  await openConfiguration(page);
  await page.reload();
  await expectWorkingScreen(page);
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "true");
  await openOneScreen(page, second, { configuration: "closed" });
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "true");
  await configurationRow(page).click();
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expectWorkingScreen(page);
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
});

test("Assistant in the top bar puts the cursor in the input", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace, { configuration: "closed" });
  await page.getByTestId("workspace-top-bar").getByRole("button", { name: "Assistant" }).click();
  await expect(new AssistantDock(page).input).toBeFocused();
});

test("a refused save opens Configuration", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace, { configuration: "closed" });
  await openConfiguration(page);
  await page.getByRole("textbox", { name: "Name of field 1" }).fill("");
  await configurationRow(page).click();
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
  // Run saves first, and the empty name is a problem in the configuration.
  await page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ }).click();
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("textbox", { name: "Name of field 1" })).toBeVisible();
});

test("an empty workspace reads 'Nothing configured yet' and starts in the conversation", async ({
  expectApiError,
  page,
}) => {
  noExtractionYet(expectApiError);
  await openStart(page, "Empty chat workspace");
  await expect(configurationRow(page)).toContainText("Nothing configured yet");
  const dock = new AssistantDock(page);
  await expect(
    dock.dock.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
});

test("a new person goes from an empty workspace to records in the strip without opening Configuration", async ({
  page,
}) => {
  await openStart(page, "Chat only workspace", "platform-adrs.md");
  const dock = new AssistantDock(page);
  await page
    .getByRole("textbox", { name: "What do you want from these documents?" })
    .fill("the architecture decisions");
  await page.getByRole("button", { name: "Suggest fields" }).click();
  await expect(dock.card).toContainText("Add record type");
  await expect(dock.card.getByRole("button", { name: /^Keep all/ })).toBeVisible();
  await dock.card.getByRole("button", { name: /^Keep all/ }).click();
  await expect(dock.card).toContainText("Kept");
  const extraction = new ExtractionPage(page);
  await extraction.run();
  await extraction.finished();
  const strip = new RecordStripPage(page);
  await expect(strip.strip).toBeVisible();
  await expect(strip.position).toHaveText(/^Record 1 of \d+$/);
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
});

test("a suggestion is a card: the changes in words, buttons that say what they keep, and no table opened", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace, { configuration: "closed" });
  const dock = new AssistantDock(page);
  await dock.ask("add a field for the approver");
  await expect(dock.card).toContainText("Add 1 field to");
  await expect(dock.card).toContainText("Approver");
  await expect(dock.card).toContainText("Waiting for you");
  await expect(configurationRow(page)).toContainText("suggested change");
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
  await expect(
    dock.card.getByRole("button", { name: /^Keep all \d+ suggested changes?$/ }),
  ).toBeVisible();
  await expect(
    dock.card.getByRole("button", { name: /^Discard \d+ suggested changes?$/ }),
  ).toBeVisible();
  await expect(
    dock.card.getByRole("button", { name: "Review suggested changes in Configuration" }),
  ).toBeVisible();

  await dock.card.getByRole("button", { name: /^Discard / }).click();
  await expect(dock.card).toContainText("Discarded");
  await expect(dock.card.getByRole("button")).toHaveCount(0);
  await expect(configurationRow(page)).not.toContainText("suggested change");
  await expect(dock.column.getByRole("status")).toContainText("Discarded");
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
});

test("Review opens Configuration with the focus in the table", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace, { configuration: "closed" });
  const dock = new AssistantDock(page);
  await dock.ask("add a field for the approver");
  await dock.card.getByRole("button", { name: /^Review/ }).click();
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "true");
  await expect(dock.bar).toBeVisible();
  const table = page.getByRole("region", { name: "Field list" });
  await expect.poll(() => table.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // Closing and reopening Configuration later does not pull the focus into the table again.
  const row = configurationRow(page);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(row).toBeFocused();
  // Each change has keep or discard exactly as before.
  await dock.newFieldRows.first().getByRole("button", { name: "Keep" }).click();
  await expect(dock.card).toContainText("1 kept, 1 waiting");
});

test("the card reads its outcome, also after a save and a reload", async ({
  api,
  expectApiError,
  page,
  person,
  request,
}) => {
  noExtractionYet(expectApiError);
  const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
  await openOneScreen(page, workspace, { configuration: "closed" });
  const dock = new AssistantDock(page);
  await dock.ask("add a field for the approver");
  await dock.card.getByRole("button", { name: /^Keep all/ }).click();
  await expect(dock.card).toContainText("Kept");
  await expect(dock.card.getByRole("button")).toHaveCount(0);
  await saveConfiguration(page);
  await page.reload();
  await expectWorkingScreen(page);
  await expect(dock.card).toContainText("Already in what you have");
  await expect(dock.card.getByRole("button")).toHaveCount(0);
});

test("a template chosen at the start is a card in the conversation", async ({ page }) => {
  await openStart(page, "Template card workspace");
  const dock = new AssistantDock(page);
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  await expect(dock.card).toContainText("Add record type");
  await expect(configurationRow(page)).toHaveAttribute("aria-expanded", "false");
  await expect(configurationRow(page)).toContainText("suggested change");
  await dock.card.getByRole("button", { name: /^Discard / }).click();
  await expect(dock.card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What do you want from these documents?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Policy rules/ }).click();
  await dock.card.getByRole("button", { name: /^Keep all/ }).click();
  await expect(configurationRow(page)).toContainText("6 fields");
});
