import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";

const DOCUMENTS = ["platform-adrs.md", "incident-runbook.md"];
const WORKING = "Assistant is working…";

/** The live connection never opens: the page has to ask the API by itself. */
async function blockLiveUpdates(page: import("@playwright/test").Page) {
  await page.routeWebSocket(/\/ws\/runs\//, (ws) => void ws.close());
}

test.describe("showing that work is going on", () => {
  test("the assistant shows a working line from the send until the reply ended", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await new ExtractionPage(page).open(project);

    // Hold the API's answer to the send, so the in-between state stays on screen.
    await page.route(/\/extraction\/assistant\/messages$/, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await dock.input.fill("add a field for the approver");
    await dock.dock.getByRole("button", { name: "Send" }).click();
    await expect(dock.conversation.getByText(WORKING)).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });

    // The reply ends: no working line and no "Writing…" are left, and the input is back.
    await expect(dock.newFieldRows.first()).toBeVisible();
    await expect(dock.conversation.getByText(WORKING)).toHaveCount(0);
    await expect(dock.conversation.getByText("Writing…")).toHaveCount(0);
    await expect(dock.input).toBeEnabled();
  });

  test("without live updates a reply still arrives, by polling", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await blockLiveUpdates(page);
    await new ExtractionPage(page).open(project);
    await expect(page.getByText("Live updates are paused")).toBeVisible();

    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows.first()).toBeVisible({ timeout: 20_000 });
    await expect(dock.conversation.getByText(WORKING)).toHaveCount(0);
    await expect(dock.input).toBeEnabled();
  });

  test("the Run button says Running… from the click until the run ended", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    await extraction.open(project);

    await page.route(/\/stages\/extract\/executions$/, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });
    await extraction.runButton.click();
    await expect(extraction.runButton).toHaveText("Running…");
    await expect(extraction.runButton).toBeDisabled();
    await expect(page.getByRole("button", { name: "Other ways to run" })).toHaveCount(0);
    await page.unrouteAll({ behavior: "wait" });

    await extraction.finished();
    await expect(extraction.runButton).not.toHaveText("Running…");
  });

  test("without live updates a run's result still arrives, by polling", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    await blockLiveUpdates(page);
    await extraction.open(project);
    await expect(page.getByText("Live updates are paused")).toBeVisible();

    await extraction.runButton.click();
    await expect(extraction.runButton).toHaveText("Run on all 2 documents", { timeout: 20_000 });
    await expect(page.getByTestId("version-line")).toBeVisible();
    await expect(extraction.runButton).toBeEnabled();
  });
});
