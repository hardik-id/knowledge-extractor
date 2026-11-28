import { type Page } from "@playwright/test";
import { AssistantDock } from "./pages/assistant-dock";
import { editPrompt, openVersionHistory, promptLine, saveConfiguration } from "./pages/extraction";
import { RecordStripPage } from "./pages/record-strip";
import { addDocument, extractPath, openDocumentsSheet } from "./pages/studio";
import { expectWorkingScreen, openOneScreen } from "./pages/working-screen";
import { expect, test } from "./fixtures";

const PROMPT = "Extract each decision record and who approved it.";
const NOTE = "Narrowed to approvals";
const QUESTION = "Output as JSON.";

test("a project built in one browser is whole in a brand-new one, and each view survives a reload", async ({
  api,
  contextFor,
  page,
  person,
}) => {
  // Many steps against a real backend: more than the default 30 s when others use it too.
  test.setTimeout(90_000);
  const project = await api.createProject({ name: "Persistent project" });
  await addDocument(person, project.run_id);
  const dock = (p: Page) => new AssistantDock(p);

  // Build it: a saved configuration with a note, a conversation, an extraction, a reviewed record.
  await openOneScreen(page, project);
  await editPrompt(page, PROMPT);
  await saveConfiguration(page, NOTE);
  await expect(page.getByTestId("version-line")).toContainText("Version 2");

  await dock(page).ask(QUESTION);
  await expect(dock(page).conversation.getByText("Assistant", { exact: true })).toBeVisible();
  await expect(dock(page).conversation.getByText("Writing…")).toHaveCount(0);

  await page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ }).click();
  const strip = new RecordStripPage(page);
  await expect(strip.position).toHaveText("Record 1 of 3");
  const list = await strip.openList();
  await list.getByRole("button", { name: "Accept all suggested" }).click();
  // It accepts one record after another: done when none is left to accept.
  await expect(list.getByRole("button", { name: "Accept all suggested" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // A brand-new browser: nothing in storage, the same person.
  const fresh = await contextFor(person);
  const again = await fresh.newPage();
  expect(await again.context().storageState()).toMatchObject({ cookies: [], origins: [] });
  await openOneScreen(again, project);

  // The records are there, reviewed, in the strip and in the list.
  const stripAgain = new RecordStripPage(again);
  await expect(stripAgain.position).toHaveText("Record 1 of 3");
  await expect(stripAgain.strip.getByText("Accepted", { exact: true }).first()).toBeVisible();
  await expect(again.getByTestId("version-line")).toContainText("Version 2");
  await expect(promptLine(again)).toContainText(PROMPT);

  const history = await openVersionHistory(again);
  await expect(history.getByText(NOTE)).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();

  // The conversation is kept for the project: opened again after a reload, it is all there.
  await again.reload();
  await expectWorkingScreen(again);
  await dock(again).input.click();
  await expect(dock(again).conversation.getByText(QUESTION)).toBeVisible();

  // The output is the records through the template, shown as Markdown text.
  await again.getByRole("button", { name: "Output", exact: true }).click();
  const output = again.getByLabel("Markdown output");
  await expect(output).toContainText("**Status:**");
  const text = (await output.textContent()) ?? "";
  await again.reload();
  await expectWorkingScreen(again);
  await again.getByRole("button", { name: "Output", exact: true }).click();
  await expect(again.getByLabel("Markdown output")).toHaveText(text);
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
