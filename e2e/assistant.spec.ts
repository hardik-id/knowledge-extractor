import { API_BASE_URL } from "./support/env";
import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { RecordStripPage } from "./pages/record-strip";
import { expectWorkingScreen } from "./pages/workspace";
import { Switcher } from "./pages/switcher";

const DOCUMENTS = ["platform-adrs.md", "incident-runbook.md"];

test.describe("the assistant", () => {
  test("proposes a field, keeping it leaves unsaved changes, clearing keeps the configuration", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await new ExtractionPage(page).open(project);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");

    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows.first()).toContainText("Approver");

    // Nothing changes until the person keeps it.
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toHaveCount(0);
    await dock.bar.getByRole("button", { name: "Keep all" }).click();
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");

    // The conversation goes, the configuration (with its unsaved field) stays.
    await dock.clear();
    await expect(dock.conversation.getByText("add a field for the approver")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
  });

  test("the conversation and the proposal are still there after a reload", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await new ExtractionPage(page).open(project);
    await dock.ask("add a field for the approver");
    await expect(dock.newFieldRows).toHaveCount(1);

    await page.reload();
    await expectWorkingScreen(page);
    await expect(dock.newFieldRows).toHaveCount(1);
    await page.getByTestId("project-top-bar").getByRole("button", { name: "Assistant" }).click();
    await expect(dock.conversation.getByText("add a field for the approver")).toBeVisible();
  });

  test("Assistant in the top bar opens the conversation and puts the cursor in the input", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const dock = new AssistantDock(page);
    await new ExtractionPage(page).open(project);
    await expect(dock.conversation).toHaveCount(0);
    await page.getByTestId("project-top-bar").getByRole("button", { name: "Assistant" }).click();
    await expect(dock.conversation).toBeVisible();
    await expect(dock.input).toBeFocused();
  });
});

test.describe("running the extraction", () => {
  test("ends with records for each document, live, and runs again", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    const switcher = new Switcher(page);
    await extraction.open(project);

    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });

    await extraction.runAll();
    await extraction.finished();
    // The progress came over the socket: the page was never reloaded.
    expect(navigations).toBe(0);

    const strip = new RecordStripPage(page);
    await expect(strip.position).toBeVisible();
    for (const name of DOCUMENTS) {
      await switcher.switchDocument(name);
      await expect(switcher.trigger).toContainText(name);
      await expect(strip.strip).toBeVisible();
    }

    await extraction.run("Run again");
    await extraction.finished();
    await expect(extraction.runButton).toHaveText("Run again");
    await expect(new RecordStripPage(page).strip).toBeVisible();
    expect(navigations).toBe(0);
  });

  test("running one document sends one file id and only that document's cell moves", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    const switcher = new Switcher(page);
    await extraction.open(project);
    await expect(extraction.runButton).toHaveText("Run on this document");

    const sent = page.waitForRequest(
      (r) =>
        r.method() === "POST" && /\/stages\/extract\/executions$/.test(new URL(r.url()).pathname),
    );
    await extraction.run();
    const body = (await sent).postDataJSON() as { file_ids?: string[] };
    expect(body.file_ids).toHaveLength(1);
    await extraction.finished();
    // The id sent is the open (first) document's, and no other document's cell was run.
    const extracted = await page.evaluate(async (url) => {
      const run = (await (await fetch(url)).json()) as {
        cells: { stage: string; status: string; file_id: string }[];
      };
      return run.cells.filter((c) => c.stage === "extract" && c.status === "succeeded");
    }, `${API_BASE_URL}/runs/${project.run_id}`);
    expect(extracted.map((c) => c.file_id)).toEqual(body.file_ids);

    await switcher.open();
    await expect(switcher.item(DOCUMENTS[0])).toContainText("to review");
    await expect(switcher.item(DOCUMENTS[1])).toContainText("Not run yet");
    await page.keyboard.press("Escape");

    // This document is current, the other is not: the button now says so.
    await expect(extraction.runButton).toHaveText("Run on all 2 documents");
  });
});
