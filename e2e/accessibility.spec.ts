import { type AxeException, expectAccessible } from "./support/accessibility";
import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { DOCS, openDocuments, openNewProjectDialog } from "./pages/studio";

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

    test("the project list, empty", async ({ page }) => {
      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
      await expect(page.getByText("No projects yet")).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading projects" })).toHaveCount(0);
      await scan(page, "project list, empty");
    });

    test("the project list, with projects", async ({ api, page }) => {
      await api.createProject({ name: "First project", description: "Contracts" });
      await api.createProject({ name: "Second project" });
      await page.goto("/studio");
      await expect(page.getByText("First project").first()).toBeVisible();
      await expect(page.getByText("Second project").first()).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading projects" })).toHaveCount(0);
      await scan(page, "project list, with projects");
    });

    test("the New project dialog", async ({ page }) => {
      await page.goto("/studio");
      const dialog = await openNewProjectDialog(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("radio", { name: /^Blank/ })).toBeVisible();
      await scan(page, "New project dialog");
    });

    test("the Documents page", async ({ api, page }) => {
      const project = await api.createProject({ name: "Documents project" });
      await openDocuments(page, project);
      await expect(page.getByRole("checkbox", { name: DOCS.roadmap })).toBeVisible();
      await scan(page, "Documents page");
    });

    for (const name of ["Define", "Review", "Output"] as const) {
      test(`the extraction page, ${name} tab`, async ({ api, page, person, request }) => {
        const project = await projectWithDocuments(api, person, request, DOCUMENTS);
        const extraction = new ExtractionPage(page);
        await extraction.open(project);
        if (name !== "Define") {
          await extraction.run("Run extraction");
          await extraction.finished();
          await extraction.openTab(name);
          await extraction.document(DOCS.roadmap).click();
          if (name === "Review") await expect(extraction.records.first()).toBeVisible();
          else await expect(page.getByText("Output as Markdown")).toBeVisible();
        }
        await scan(page, `extraction page, ${name} tab`);
      });
    }

    test("the version history", async ({ api, page, person, request }) => {
      const project = await projectWithDocuments(api, person, request, DOCUMENTS);
      await new ExtractionPage(page).open(project);
      await expect(page.getByTestId("version-line")).toBeVisible();
      await page.getByRole("button", { name: "Version history" }).click();
      const history = page.getByRole("dialog", { name: "Version history" });
      await expect(history.getByRole("list", { name: "Versions" })).toBeVisible();
      await scan(page, "version history");
    });

    test("the assistant with a proposal showing", async ({ api, page, person, request }) => {
      const project = await projectWithDocuments(api, person, request, DOCUMENTS);
      const extraction = new ExtractionPage(page);
      await extraction.open(project);
      await extraction.ask("add a field for the approver");
      await expect(
        extraction.conversation.getByRole("region", { name: "Proposed changes" }),
      ).toBeVisible();
      await scan(page, "assistant with a proposal");
    });
  });
}
