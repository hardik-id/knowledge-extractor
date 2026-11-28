import { type AxeException, expectAccessible } from "./support/accessibility";
import { expect, test } from "./fixtures";
import { AssistantDock } from "./pages/assistant-dock";
import {
  ExtractionPage,
  openTemplatesDialog,
  openVersionHistory,
  openVersionMenu,
  workspaceWithDocuments,
} from "./pages/extraction";
import {
  DOCS,
  openDocuments,
  openExtraction,
  openNewWorkspaceDialog,
  openStart,
} from "./pages/studio";

/**
 * Violations that cannot be fixed in the app, each with the issue that tracks it.
 * Keep this short: a fix in the app is the answer, not an entry here.
 */
const EXCEPTIONS: readonly AxeException[] = [];

const DOCUMENTS = [DOCS.roadmap, DOCS.runbook];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    // The app follows the system theme, so the browser's colour scheme picks it.
    test.use({ colorScheme: scheme });

    const scan = (page: import("@playwright/test").Page, screen: string) =>
      expectAccessible(page, `${screen} (${scheme})`, EXCEPTIONS);

    test("the workspace list, empty", async ({ page }) => {
      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
      await expect(page.getByText("No workspaces yet")).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading workspaces" })).toHaveCount(0);
      await scan(page, "workspace list, empty");
    });

    test("the workspace list, with workspaces", async ({ api, page }) => {
      await api.createWorkspace({ name: "First workspace", description: "Contracts" });
      await api.createWorkspace({ name: "Second workspace" });
      await page.goto("/studio");
      await expect(page.getByText("First workspace").first()).toBeVisible();
      await expect(page.getByText("Second workspace").first()).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading workspaces" })).toHaveCount(0);
      await scan(page, "workspace list, with workspaces");
    });

    test("the New workspace dialog", async ({ page }) => {
      await page.goto("/studio");
      const dialog = await openNewWorkspaceDialog(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Name")).toBeVisible();
      await expect(dialog.getByRole("radio")).toHaveCount(0);
      await scan(page, "New workspace dialog");
    });

    test("the Documents page", async ({ api, page }) => {
      const workspace = await api.createWorkspace({ name: "Documents workspace" });
      await openDocuments(page, workspace);
      await expect(page.getByRole("checkbox", { name: DOCS.roadmap })).toBeVisible();
      await scan(page, "Documents page");
    });

    for (const name of ["Document", "Output"] as const) {
      test(`the working screen, ${name} view`, async ({ api, page, person, request }) => {
        const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
        const extraction = new ExtractionPage(page);
        await extraction.open(workspace);
        await extraction.runAll();
        await extraction.finished();
        if (name === "Document") {
          await expect(page.getByRole("region", { name: "Found in this record" })).toBeVisible();
        } else {
          await page.getByRole("button", { name: "Output", exact: true }).click();
          await expect(page.getByText("Output as Markdown")).toBeVisible();
        }
        await scan(page, `working screen, ${name} view`);
      });
    }

    test("the working screen before a run", async ({ api, page, person, request }) => {
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      await new ExtractionPage(page).open(workspace);
      await scan(page, "working screen before a run");
    });

    test("the start panel", async ({ page }) => {
      await openStart(page);
      await scan(page, "start panel");
    });

    test("the version history", async ({ api, page, person, request }) => {
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      await new ExtractionPage(page).open(workspace);
      await expect(page.getByTestId("version-line")).toBeVisible();
      const history = await openVersionHistory(page);
      await expect(history.getByRole("list", { name: "Versions" })).toBeVisible();
      await scan(page, "version history");
    });

    test("the open version menu and the open Run menu", async ({ api, page, person, request }) => {
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      await new ExtractionPage(page).open(workspace);
      const menu = await openVersionMenu(page);
      await expect(page.getByRole("dialog", { name: "Version" })).toBeVisible();
      await expect(menu).toBeVisible();
      await scan(page, "version menu");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Other ways to run" }).click();
      await expect(page.getByRole("menuitem", { name: /^Run on all/ })).toBeVisible();
      await scan(page, "run menu");
    });

    test("the templates dialog", async ({ api, page }) => {
      const workspace = await api.createWorkspace({ name: "Templates workspace" });
      await openExtraction(page, workspace, [DOCS.roadmap]);
      const dialog = await openTemplatesDialog(page);
      await dialog.getByRole("radio").nth(1).check();
      await expect(dialog.getByRole("region", { name: "What it would bring" })).toContainText(
        "Compared with the editor",
      );
      await scan(page, "templates dialog");
    });

    test("the assistant with a proposal showing", async ({ api, page, person, request }) => {
      const workspace = await workspaceWithDocuments(api, person, request, DOCUMENTS);
      const dock = new AssistantDock(page);
      await new ExtractionPage(page).open(workspace);
      await dock.ask("add a field for the approver");
      await expect(dock.bar).toBeVisible();
      await scan(page, "assistant with a proposal");
    });
  });
}
