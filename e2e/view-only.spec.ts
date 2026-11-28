import { type Page } from "@playwright/test";
import { expect, newPerson, test } from "./fixtures";
import { expectAccessible } from "./support/accessibility";
import { API_BASE_URL } from "./support/env";
import { giveRole } from "./support/roles";
import { AssistantDock } from "./pages/assistant-dock";
import {
  addDocuments,
  ExtractionPage,
  openTemplatesDialog,
  openVersionMenu,
  workspaceWithDocuments,
} from "./pages/extraction";
import { DOCS, openDocumentsSheet } from "./pages/studio";
import {
  configurationRow,
  expectWorkingScreen,
  fieldColumn,
  openConfiguration,
  viewOnlyTag,
} from "./pages/working-screen";

const DOCUMENTS = [DOCS.roadmap, DOCS.runbook];
const ASK = "add a field for the approver";

/** What the top bar and the column offer to someone who may change the workspace. */
async function expectControls(page: Page) {
  const dock = new AssistantDock(page);
  await expect(viewOnlyTag(page)).toHaveCount(0);
  await expect(new ExtractionPage(page).runButton).toBeVisible();
  await expect(dock.input).toBeVisible();
  await expect(
    dock.dock.getByRole("button", { name: "More about the conversation" }),
  ).toBeVisible();
  await openConfiguration(page);
  await expect(fieldColumn(page).getByRole("button", { name: "Add field" })).toBeVisible();
  await expect(
    fieldColumn(page).getByRole("button", { name: "Record type options" }),
  ).toBeVisible();
  await expect(fieldColumn(page).getByRole("checkbox").first()).toBeVisible();
  // The document switcher offers to add or remove documents, and More offers templates.
  await openDocumentsSheet(page);
  await page.keyboard.press("Escape");
  await openTemplatesDialog(page);
  await page.keyboard.press("Escape");
}

test.describe("view only", () => {
  /** An owner's workspace with documents and a conversation holding a suggestion. */
  async function sharedWorkspace({
    api,
    page,
    person,
    request,
  }: {
    api: Parameters<typeof workspaceWithDocuments>[0];
    page: Page;
    person: Parameters<typeof workspaceWithDocuments>[1];
    request: Parameters<typeof workspaceWithDocuments>[2];
  }) {
    const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
    const owner = new ExtractionPage(page);
    await owner.open(workspace);
    await new AssistantDock(page).ask(ASK);
    await expect(new AssistantDock(page).card).toBeVisible();
    return workspace;
  }

  test("a Viewer reads everything and is offered no control that changes it", async ({
    api,
    contextFor,
    page,
    person,
    request,
  }) => {
    const workspace = await sharedWorkspace({ api, page, person, request });
    const viewer = newPerson();
    await giveRole(request, person, workspace, viewer, "viewer");
    const view = await (await contextFor(viewer)).newPage();
    await new ExtractionPage(view).open(workspace);
    const dock = new AssistantDock(view);

    // The tag says why, and it stays at a narrow width.
    await expect(viewOnlyTag(view)).toBeVisible();
    await view.setViewportSize({ width: 390, height: 844 });
    await expect(viewOnlyTag(view)).toBeVisible();
    await view.setViewportSize({ width: 1280, height: 720 });

    // The top bar: no Run, no More; the version menu reads and offers no save; documents cannot be changed.
    const bar = view.getByTestId("workspace-top-bar");
    await expect(new ExtractionPage(view).runButton).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
    const menu = await openVersionMenu(view);
    await expect(menu.getByRole("button", { name: "Version history" })).toBeVisible();
    await expect(menu.getByRole("button", { name: /^(Save|Discard changes)/ })).toHaveCount(0);
    await view.keyboard.press("Escape");
    await bar
      .getByRole("group", { name: "Document" })
      .getByRole("button", { name: /^Document: / })
      .click();
    await expect(view.getByRole("menuitem", { name: /product-roadmap/ })).toBeVisible();
    await expect(view.getByRole("menuitem", { name: "Add or remove documents" })).toHaveCount(0);
    await view.keyboard.press("Escape");

    // The conversation reads; there is no input, no Clear conversation, and the suggestion has no buttons.
    await expect(dock.conversation.getByText(ASK)).toBeVisible();
    await expect(dock.input).toHaveCount(0);
    await expect(dock.dock.getByRole("button", { name: "Send" })).toHaveCount(0);
    await expect(
      dock.dock.getByRole("button", { name: "More about the conversation" }),
    ).toHaveCount(0);
    await expect(dock.card).toBeVisible();
    await expect(dock.card).toContainText("Approver");
    await expect(dock.card.getByRole("button")).toHaveCount(0);
    await expect(dock.card).not.toContainText("Waiting for you");
    await expect(configurationRow(view)).not.toContainText("suggested change");

    // Configuration reads as text.
    await openConfiguration(view);
    const column = fieldColumn(view);
    await expect(column.getByRole("heading", { name: /\S/ }).first()).toBeVisible();
    await expect(column.getByRole("button", { name: "Add field" })).toHaveCount(0);
    await expect(column.getByRole("button", { name: "Record type options" })).toHaveCount(0);
    await expect(column.getByRole("checkbox")).toHaveCount(0);
    await expect(column.getByRole("textbox")).toHaveCount(0);
    await expect(column.getByRole("combobox")).toHaveCount(0);
    await expect(column.getByText("What to extract", { exact: true })).toBeVisible();
    await expect(column.getByText("Automatic", { exact: true })).toBeVisible();
    await expect(
      column.getByTestId("read-only-fields").getByRole("listitem").first(),
    ).toBeVisible();
    await expect(column.getByText(/Exact quote/).first()).toBeVisible();
    await expect(column.getByTestId("field-dot").first()).toBeVisible();
    // No suggested rows in the table.
    await expect(column.getByText("New field")).toHaveCount(0);

    // A click on a field selects it: that only changes the highlights.
    const first = column.getByTestId("read-only-fields").getByRole("button").first();
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");

    await expectAccessible(view, "working screen of a Viewer");
  });

  test("a Viewer of an empty workspace sees what is missing in words", async ({
    api,
    contextFor,
    person,
    request,
  }) => {
    const bare = await api.createWorkspace({ name: "No documents" });
    const viewer = newPerson();
    await giveRole(request, person, bare, viewer, "viewer");
    const view = await (await contextFor(viewer)).newPage();
    await view.goto(`/studio/workspaces/${bare.id}`);
    await expect(view.getByText("This workspace has no documents yet.")).toBeVisible();
    await expect(view.getByRole("button", { name: /^Use .*documents?$/ })).toHaveCount(0);
    await expect(viewOnlyTag(view)).toBeVisible();

    // Nothing configured and nobody has spoken: no start content, only the plain words.
    const blank = await request.post(`${API_BASE_URL}/workspaces`, {
      headers: { authorization: `Bearer ${person.token}` },
      data: { name: "Blank", template_id: "blank" },
    });
    expect(blank.ok()).toBeTruthy();
    const workspace = (await blank.json()) as { id: string; run_id: string };
    await addDocuments(
      request,
      person,
      { ...workspace, name: "Blank", description: "" },
      DOCUMENTS,
    );
    await giveRole(request, person, workspace, viewer, "viewer");
    await new ExtractionPage(view).open({ ...workspace, name: "Blank", description: "" });
    const dock = new AssistantDock(view);
    await expect(dock.conversation.getByText("No conversation yet.")).toBeVisible();
    await expect(view.getByText("What do you want from these documents?")).toHaveCount(0);
    await expect(view.getByRole("button", { name: "Add a field yourself" })).toHaveCount(0);
  });

  test("an Editor has no tag and every control of this part, and so does an Owner", async ({
    api,
    contextFor,
    page,
    person,
    request,
  }) => {
    const workspace = await sharedWorkspace({ api, page, person, request });
    const editor = newPerson();
    await giveRole(request, person, workspace, editor, "editor");
    const view = await (await contextFor(editor)).newPage();
    await new ExtractionPage(view).open(workspace);
    await expectControls(view);
    // The suggestion waits for them, with its buttons.
    await expect(
      new AssistantDock(view).card.getByRole("button", { name: /^Keep all/ }),
    ).toBeVisible();

    // The Owner is unchanged.
    await page.reload();
    await expectWorkingScreen(page);
    await expectControls(page);
  });

  test("a Viewer made while the screen is open loses the controls after a refused action", async ({
    api,
    contextFor,
    expectApiError,
    page,
    person,
    request,
  }) => {
    const workspace = await sharedWorkspace({ api, page, person, request });
    const other = newPerson();
    await giveRole(request, person, workspace, other, "editor");
    const view = await (await contextFor(other)).newPage();
    await new ExtractionPage(view).open(workspace);
    const dock = new AssistantDock(view);
    await expect(dock.input).toBeVisible();
    await expect(viewOnlyTag(view)).toHaveCount(0);

    // The owner changes the role; the screen does not know yet.
    await giveRole(request, person, workspace, other, "viewer");
    expectApiError({ status: 403, method: "POST", path: /assistant\/messages$/ });
    await dock.input.fill("what do you see?");
    await dock.dock.getByRole("button", { name: "Send" }).click();

    // The refusal is shown, and the screen follows the role.
    await expect(view.getByText("Couldn't send your message")).toBeVisible();
    await expect(viewOnlyTag(view)).toBeVisible();
    await expect(dock.input).toHaveCount(0);
    await expect(new ExtractionPage(view).runButton).toHaveCount(0);
  });
});
