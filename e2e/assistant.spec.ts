import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { Switcher } from "./pages/switcher";

const DOCUMENTS = ["platform-adrs.md", "incident-runbook.md"];

test.describe("the assistant", () => {
  test("proposes a field, applying it leaves unsaved changes, clearing keeps the configuration", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    await extraction.open(project);
    await expect(page.getByTestId("version-line")).not.toContainText("unsaved changes");

    await extraction.ask("add a field for the approver");
    await expect(extraction.conversation.getByText("add a field for the approver")).toBeVisible();
    const proposal = extraction.conversation.getByRole("region", { name: "Proposed changes" });
    await expect(proposal).toBeVisible();
    await expect(proposal.getByText("Approver", { exact: false }).first()).toBeVisible();

    // Nothing changes until the person applies it.
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toHaveCount(0);
    await proposal.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");

    // The conversation goes, the configuration (with its unsaved field) stays.
    await extraction.assistant.getByRole("button", { name: "Clear conversation" }).click();
    await page
      .getByRole("dialog", { name: "Clear the conversation?" })
      .getByRole("button", { name: "Clear conversation" })
      .click();
    await expect(extraction.conversation.getByRole("region")).toHaveCount(0);
    await expect(extraction.conversation.getByText("add a field for the approver")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More actions for Approver" })).toBeVisible();
    await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
  });

  test("the conversation is still there after a reload", async ({ api, page, person, request }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    await extraction.open(project);
    await extraction.ask("add a field for the approver");
    await expect(
      extraction.conversation.getByRole("region", { name: "Proposed changes" }),
    ).toBeVisible();

    await page.reload();
    await expect(extraction.tab("Define")).toBeVisible();
    await expect(extraction.conversation.getByText("add a field for the approver")).toBeVisible();
    await expect(
      extraction.conversation.getByRole("region", { name: "Proposed changes" }),
    ).toBeVisible();
  });
});

test.describe("running the extraction", () => {
  test("ends in Ready to proceed with records for each document, live, and runs again", async ({
    api,
    page,
    person,
    request,
  }) => {
    const project = await projectWithDocuments(api, person, request, DOCUMENTS);
    const extraction = new ExtractionPage(page);
    await extraction.open(project);

    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });

    await extraction.runAll();
    await extraction.finished();
    // The progress came over the socket: the page was never reloaded.
    expect(navigations).toBe(0);

    await extraction.openTab("Review");
    for (const name of DOCUMENTS) {
      await extraction.document(name).click();
      await expect(extraction.summary()).toBeVisible();
      await expect(extraction.records.first()).toBeVisible();
    }

    await extraction.run("Run again");
    await extraction.finished();
    await expect(extraction.runButton).toHaveText("Run again");
    await expect(extraction.records.first()).toBeVisible();
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

    await switcher.open();
    await expect(switcher.item(DOCUMENTS[0])).toContainText("to review");
    await expect(switcher.item(DOCUMENTS[1])).toContainText("Not run yet");
    await page.keyboard.press("Escape");

    // This document is current, the other is not: the button now says so.
    await expect(extraction.runButton).toHaveText("Run on all 2 documents");
  });
});
