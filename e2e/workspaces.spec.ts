import { expectWorkingScreen } from "./pages/working-screen";
import { expect, test } from "./fixtures";
import {
  DOCS,
  addDocument,
  openDocuments,
  openDocumentsSheet,
  openNewWorkspaceDialog,
  pickDocuments,
  saveDocuments,
  submitDocumentsButton,
} from "./pages/studio";
import { clickUntilOpen } from "./support/first-click";

function row(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
}

test("a new person sees an empty list", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();
});

test("a workspace made with a description shows in the list with its facts", async ({ page }) => {
  await page.goto("/studio");
  const dialog = await openNewWorkspaceDialog(page);
  await dialog.getByLabel("Name").fill("Contracts");
  await dialog.getByLabel("Description (optional)").fill("Renewal dates and notice periods");
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/studio\/workspaces\/[^/]+$/);

  await page.goto("/studio");
  const contracts = row(page, "Contracts");
  await expect(contracts.getByText("Renewal dates and notice periods")).toBeVisible();
  await expect(contracts.getByText("0 documents")).toBeVisible();
  await expect(contracts.getByText("Configuration version 1")).toBeVisible();
});

test("a workspace is renamed and its description changed", async ({ api, page }) => {
  await api.createWorkspace({ name: "Old name", description: "Old description" });
  await page.goto("/studio");
  const dialog = await clickUntilOpen(
    page,
    row(page, "Old name").getByRole("button", { name: /^Edit / }),
    page.getByRole("dialog", { name: "Edit workspace" }),
  );
  await dialog.getByLabel("Name").fill("New name");
  await dialog.getByLabel("Description (optional)").fill("New description");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(row(page, "New name").getByText("New description")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Old name" })).toHaveCount(0);
});

test("a workspace is deleted after the person confirms", async ({ api, page }) => {
  await api.createWorkspace({ name: "Keep me" });
  await api.createWorkspace({ name: "Delete me" });
  await page.goto("/studio");
  const confirm = await clickUntilOpen(
    page,
    row(page, "Delete me").getByRole("button", { name: /^Delete / }),
    page.getByRole("dialog", { name: "Delete “Delete me”?" }),
  );
  await confirm.getByRole("button", { name: "Delete workspace" }).click();

  await expect(page.getByRole("heading", { name: "Delete me" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Keep me" })).toBeVisible();
  expect((await api.listWorkspaces()).map((p) => p.name)).toEqual(["Keep me"]);
});

test("a workspace is renamed from its top bar at once, and deleted from there", async ({
  api,
  page,
}) => {
  const workspace = await api.createWorkspace({ name: "Top bar name", description: "Was this" });
  await api.createWorkspace({ name: "Stays" });
  await openDocuments(page, workspace);
  const bar = page.getByTestId("workspace-top-bar");

  const menu = bar.getByRole("button", { name: "Top bar name" });
  // A menu holds the focus itself, which `clickUntilOpen` does not accept: click until it shows.
  await expect(async () => {
    if (!(await page.getByRole("menu").isVisible())) await menu.click({ timeout: 2_000 });
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename workspace" });
  await dialog.getByLabel("Name").fill("Renamed here");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(bar.getByRole("button", { name: "Renamed here" })).toBeVisible();
  expect((await api.listWorkspaces()).map((p) => p.name).sort()).toEqual(["Renamed here", "Stays"]);

  await bar.getByRole("button", { name: "Renamed here" }).click();
  await page.getByRole("menuitem", { name: "Edit description" }).click();
  const describing = page.getByRole("dialog", { name: "Edit description" });
  await expect(describing.getByLabel("Description (optional)")).toHaveValue("Was this");
  await describing.getByLabel("Description (optional)").fill("Now this");
  await describing.getByRole("button", { name: "Save", exact: true }).click();
  await expect(describing).toBeHidden();
  const saved = (await api.listWorkspaces()).find((p) => p.id === workspace.id);
  expect(saved?.description).toBe("Now this");

  await bar.getByRole("button", { name: "Renamed here" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “Renamed here”?" });
  await confirm.getByRole("button", { name: "Delete workspace" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: "Stays" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Renamed here" })).toHaveCount(0);
  expect((await api.listWorkspaces()).map((p) => p.name)).toEqual(["Stays"]);
});

test("the workspace worked on last comes first", async ({ api, page }) => {
  await api.createWorkspace({ name: "First made" });
  await api.createWorkspace({ name: "Second made" });
  const headings = page.getByRole("listitem").getByRole("heading", { level: 2 });
  await page.goto("/studio");
  await expect(headings).toHaveText(["Second made", "First made"]);

  const dialog = await clickUntilOpen(
    page,
    row(page, "First made").getByRole("button", { name: /^Edit / }),
    page.getByRole("dialog", { name: "Edit workspace" }),
  );
  await dialog.getByLabel("Description (optional)").fill("Touched last");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(headings).toHaveText(["First made", "Second made"]);
});

test("documents are picked and used, then one is added and one removed", async ({
  api,
  expectApiError,
  page,
}) => {
  // Taking a document out makes the app look for its reviewed records: there are none.
  expectApiError({ status: 404, method: "GET", path: /\/extraction$/ });
  const workspace = await api.createWorkspace({ name: "Documents workspace" });
  await openDocuments(page, workspace);
  await pickDocuments(page, [DOCS.roadmap, DOCS.runbook]);
  await expect(page.getByText("2 documents selected")).toBeVisible();
  await expect(submitDocumentsButton(page)).toHaveText("Use 2 documents");
  await submitDocumentsButton(page).click();
  await expectWorkingScreen(page);
  await expect(page).toHaveURL(new RegExp(`/studio/workspaces/${workspace.id}$`));

  await page.reload();
  const sheet = await openDocumentsSheet(page);
  await expect(sheet.getByText("2 documents selected")).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: DOCS.roadmap })).toBeChecked();
  await expect(sheet.getByRole("checkbox", { name: DOCS.runbook })).toBeChecked();

  await sheet.getByRole("checkbox", { name: DOCS.decisions }).check();
  await sheet.getByRole("checkbox", { name: DOCS.runbook }).uncheck();
  await saveDocuments(page);

  await page.goto("/studio");
  await expect(row(page, "Documents workspace").getByText("2 documents")).toBeVisible();
  await page.getByRole("link", { name: "Documents workspace" }).click();
  await expectWorkingScreen(page);
  const again = await openDocumentsSheet(page);
  await expect(again.getByRole("checkbox", { name: DOCS.roadmap })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: DOCS.decisions })).toBeChecked();
  await expect(again.getByRole("checkbox", { name: DOCS.runbook })).not.toBeChecked();
});

test("Use documents is disabled until there is a document", async ({ api, page }) => {
  const workspace = await api.createWorkspace({ name: "Empty workspace" });
  await openDocuments(page, workspace);
  const use = submitDocumentsButton(page);
  await expect(use).toBeDisabled();
  await expect(use).toHaveText("Use documents");
  await expect(page.getByText("Select at least one document.")).toBeVisible();

  await pickDocuments(page, [DOCS.roadmap]);
  await expect(use).toBeEnabled();
  await expect(use).toHaveText("Use 1 document");
});

test("an old extraction address lands on the workspace", async ({ api, page, person }) => {
  const workspace = await api.createWorkspace({ name: "Old address" });
  await addDocument(person, workspace.run_id);
  await page.goto(`/studio/workspaces/${workspace.id}/extract`);
  await expect(page).toHaveURL(new RegExp(`/studio/workspaces/${workspace.id}$`));
  await expectWorkingScreen(page);
});

test("an old project address opens the same workspace", async ({ api, page, person }) => {
  const workspace = await api.createWorkspace({ name: "Old project address" });
  await addDocument(person, workspace.run_id);
  await page.goto("/studio/projects");
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  for (const old of [
    `/studio/projects/${workspace.id}`,
    `/studio/projects/${workspace.id}/extract`,
  ]) {
    await page.goto(old);
    await expect(page).toHaveURL(new RegExp(`/studio/workspaces/${workspace.id}$`));
    await expectWorkingScreen(page);
  }
});
