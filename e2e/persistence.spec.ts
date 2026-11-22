import { type Page } from "@playwright/test";
import { openVersionHistory, saveConfiguration } from "./pages/extraction";
import { addDocument, extractPath, openDocumentsSheet, tab } from "./pages/studio";
import { expect, test } from "./fixtures";

const PROMPT = "Extract each decision record and who approved it.";
const NOTE = "Narrowed to approvals";
const QUESTION = "Output as JSON.";

/** The tab panel that is showing (hidden pages and panels stay in the DOM). */
function panel(page: Page) {
  return page.getByRole("tabpanel");
}

test("a project built in one browser is whole in a brand-new one, and each tab survives a reload", async ({
  api,
  contextFor,
  page,
  person,
}) => {
  // Many steps against a real backend: more than the default 30 s when others use it too.
  test.setTimeout(90_000);
  const project = await api.createProject({ name: "Persistent project" });
  await addDocument(person, project.run_id);

  // Build it: a saved configuration with a note, a conversation, an extraction, a reviewed record.
  await page.goto(extractPath(project.id));
  await expect(tab(page, "Define")).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("What to extract").fill(PROMPT);
  await saveConfiguration(page, NOTE);
  await expect(page.getByTestId("version-line")).toContainText("Version 2");

  const message = page.getByLabel("Message to the assistant");
  await message.fill(QUESTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const conversation = page.getByRole("log", { name: "Conversation" });
  await expect(conversation.getByText("Assistant", { exact: true })).toBeVisible();
  await expect(conversation.getByText("Writing…")).toHaveCount(0);

  await page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ }).click();
  await expect(tab(page, "Review")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Accept all suggested" }).click();
  // It accepts one record after another: done when none is left to accept.
  await expect(page.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  await expect(panel(page).getByText(/\b[1-9]\d* accepted\b/)).toBeVisible();
  const reviewSummary =
    (await panel(page)
      .getByText(/accepted/)
      .first()
      .textContent()) ?? "";

  // A brand-new browser: nothing in storage, the same person.
  const fresh = await contextFor(person);
  const again = await fresh.newPage();
  expect(await again.context().storageState()).toMatchObject({ cookies: [], origins: [] });
  await again.goto(extractPath(project.id));

  // The run had output, so the page opens on Review with the reviewed records.
  await expect(tab(again, "Review")).toHaveAttribute("aria-selected", "true");
  await expect(
    panel(again).getByText(reviewSummary.trim(), { exact: false }).first(),
  ).toBeVisible();
  await expect(again.getByTestId("version-line")).toContainText("Version 2");

  const history = await openVersionHistory(again);
  await expect(history.getByText(NOTE)).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();

  // Each tab keeps its content over a reload.
  await tab(again, "Define").click();
  await expect(again.getByLabel("What to extract")).toHaveValue(PROMPT);
  await expect(again.getByRole("log", { name: "Conversation" }).getByText(QUESTION)).toBeVisible();
  await again.reload();
  await tab(again, "Define").click();
  await expect(again.getByLabel("What to extract")).toHaveValue(PROMPT);
  await expect(again.getByRole("log", { name: "Conversation" }).getByText(QUESTION)).toBeVisible();

  await tab(again, "Review").click();
  await again.reload();
  await tab(again, "Review").click();
  await expect(
    panel(again).getByText(reviewSummary.trim(), { exact: false }).first(),
  ).toBeVisible();
  await expect(panel(again).getByText("Accepted").first()).toBeVisible();

  await tab(again, "Output").click();
  // The output is the records through the template, shown as Markdown text.
  const output = panel(again).getByLabel("Markdown output");
  await expect(output).toContainText("**Status:**");
  const text = (await output.textContent()) ?? "";
  await again.reload();
  await tab(again, "Output").click();
  await expect(panel(again).getByLabel("Markdown output")).toHaveText(text);
});

test("a project's documents are there in a new browser", async ({ api, contextFor, person }) => {
  const project = await api.createProject({ name: "Documents project" });
  await addDocument(person, project.run_id);

  const fresh = await contextFor(person);
  const page = await fresh.newPage();
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Documents project" })).toBeVisible();
  await expect(page.getByText("1 document")).toBeVisible();
  await page.getByRole("link", { name: "Documents project" }).click();
  await expect(page).toHaveURL(extractPath(project.id));
  const sheet = await openDocumentsSheet(page);
  await expect(sheet.getByText("1 document selected")).toBeVisible();
});
