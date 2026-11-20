import { expect, test } from "./fixtures";
import {
  DOCS,
  openDocuments,
  openNewProjectDialog,
  pickDocuments,
  saveDocuments,
} from "./pages/studio";
import { clickUntilOpen } from "./support/first-click";

function row(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
}

test("a new person sees an empty list", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
});

test("a project made with a description shows in the list with its facts", async ({ page }) => {
  await page.goto("/studio");
  const dialog = await openNewProjectDialog(page);
  await dialog.getByLabel("Name").fill("Contracts");
  await dialog.getByLabel("Description (optional)").fill("Renewal dates and notice periods");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[^/]+$/);

  await page.goto("/studio");
  const contracts = row(page, "Contracts");
  await expect(contracts.getByText("Renewal dates and notice periods")).toBeVisible();
  await expect(contracts.getByText("0 documents")).toBeVisible();
  await expect(contracts.getByText("No configuration yet")).toBeVisible();
});

test("a project is renamed and its description changed", async ({ api, page }) => {
  await api.createProject({ name: "Old name", description: "Old description" });
  await page.goto("/studio");
  const dialog = await clickUntilOpen(
    page,
    row(page, "Old name").getByRole("button", { name: /^Edit / }),
    page.getByRole("dialog", { name: "Edit project" }),
  );
  await dialog.getByLabel("Name").fill("New name");
  await dialog.getByLabel("Description (optional)").fill("New description");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(row(page, "New name").getByText("New description")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Old name" })).toHaveCount(0);
});

test("a project is deleted after the person confirms", async ({ api, page }) => {
  await api.createProject({ name: "Keep me" });
  await api.createProject({ name: "Delete me" });
  await page.goto("/studio");
  const confirm = await clickUntilOpen(
    page,
    row(page, "Delete me").getByRole("button", { name: /^Delete / }),
    page.getByRole("dialog", { name: "Delete “Delete me”?" }),
  );
  await confirm.getByRole("button", { name: "Delete project" }).click();

  await expect(page.getByRole("heading", { name: "Delete me" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Keep me" })).toBeVisible();
  expect((await api.listProjects()).map((p) => p.name)).toEqual(["Keep me"]);
});

test("the project worked on last comes first", async ({ api, page }) => {
  await api.createProject({ name: "First made" });
  await api.createProject({ name: "Second made" });
  const headings = page.getByRole("listitem").getByRole("heading", { level: 2 });
  await page.goto("/studio");
  await expect(headings).toHaveText(["Second made", "First made"]);

  const dialog = await clickUntilOpen(
    page,
    row(page, "First made").getByRole("button", { name: /^Edit / }),
    page.getByRole("dialog", { name: "Edit project" }),
  );
  await dialog.getByLabel("Description (optional)").fill("Touched last");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(headings).toHaveText(["First made", "Second made"]);
});

test("documents are picked and saved, then one is added and one removed", async ({
  api,
  expectApiError,
  page,
}) => {
  // Taking a document out makes the app look for its reviewed records: there are none.
  expectApiError({ status: 404, method: "GET", path: /\/extraction$/ });
  const project = await api.createProject({ name: "Documents project" });
  await openDocuments(page, project);
  await pickDocuments(page, [DOCS.roadmap, DOCS.runbook]);
  await expect(page.getByText("2 documents selected")).toBeVisible();
  await saveDocuments(page);

  await page.reload();
  await expect(page.getByText("2 documents selected")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: DOCS.roadmap })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: DOCS.runbook })).toBeChecked();

  await page.getByRole("checkbox", { name: DOCS.decisions }).check();
  await page.getByRole("checkbox", { name: DOCS.runbook }).uncheck();
  await saveDocuments(page);

  await page.goto("/studio");
  await expect(row(page, "Documents project").getByText("2 documents")).toBeVisible();
  await page.getByRole("link", { name: "Documents project" }).click();
  await expect(page).toHaveURL(/\/extract$/);
  await page.getByRole("link", { name: "Change documents" }).click();
  await expect(page.getByRole("checkbox", { name: DOCS.roadmap })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: DOCS.decisions })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: DOCS.runbook })).not.toBeChecked();
});

test("Open in extraction is disabled until there is a document", async ({ api, page }) => {
  const project = await api.createProject({ name: "Empty project" });
  await openDocuments(page, project);
  const open = page.getByRole("button", { name: "Open in extraction" });
  await expect(open).toBeDisabled();
  await expect(page.getByText("Select at least one document.")).toBeVisible();

  await pickDocuments(page, [DOCS.roadmap]);
  await expect(open).toBeEnabled();
});
