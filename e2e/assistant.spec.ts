import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";

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
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    await extraction.ask("add a field for the approver");
    await expect(extraction.conversation.getByText("add a field for the approver")).toBeVisible();
    const proposal = extraction.conversation.getByRole("region", { name: "Proposed changes" });
    await expect(proposal).toBeVisible();
    await expect(proposal.getByText("Approver", { exact: false }).first()).toBeVisible();

    // Nothing changes until the person applies it.
    await expect(page.getByRole("button", { name: "Remove Approver" })).toHaveCount(0);
    await proposal.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("button", { name: "Remove Approver" })).toBeVisible();
    await expect(page.getByText("Unsaved changes").first()).toBeVisible();

    // The conversation goes, the configuration (with its unsaved field) stays.
    await extraction.assistant.getByRole("button", { name: "Clear conversation" }).click();
    await page
      .getByRole("dialog", { name: "Clear the conversation?" })
      .getByRole("button", { name: "Clear conversation" })
      .click();
    await expect(extraction.conversation.getByRole("region")).toHaveCount(0);
    await expect(extraction.conversation.getByText("add a field for the approver")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove Approver" })).toBeVisible();
    await expect(page.getByText("Unsaved changes").first()).toBeVisible();
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

    await extraction.run("Run extraction");
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
    await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
    await expect(extraction.records.first()).toBeVisible();
    expect(navigations).toBe(0);
  });
});
