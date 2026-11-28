import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { workspaceWithDocuments } from "./pages/extraction";
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
