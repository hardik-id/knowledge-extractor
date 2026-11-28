import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, addDocuments } from "./pages/extraction";
import { RecordStripPage } from "./pages/record-strip";
import { documentPane } from "./pages/working-screen";
import {
  DOCS,
  createWorkspaceFromDialog,
  openDocuments,
  pickDocuments,
  submitDocumentsButton,
} from "./pages/studio";

/**
 * Screenshot comparison of a few stable screens, in the light theme, in Chromium on Linux.
 * A change that makes one of them look different fails here, and a person reviews the
 * expected, actual and diff pictures (or accepts them with `npm run test:e2e:update-snapshots`).
 *
 * The threshold is small on purpose: `maxDiffPixelRatio` of 0.002 lets font anti-aliasing
 * noise through (about 0.2% of the pixels), but a moved margin, a changed colour of a
 * button or a wrapped line is a larger change and fails. A looser value would hide the
 * regressions these tests exist for.
 */
test.use({
  viewport: { width: 1280, height: 800 },
  colorScheme: "light",
  reducedMotion: "reduce",
  locale: "en-US",
  timezoneId: "UTC",
});

const SHOT = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.002,
} as const;

/**
 * Times and dates change with every run (and with the clock), so the shot hides them.
 * So does the backend status badge (its word depends on the stack),
 * and the dev server's own badge ("Cache disabled"), which is not part of the app.
 */
function dates(page: Page): Locator[] {
  return [
    page.locator("time"),
    page.getByTestId("version-line"),
    page.getByTestId("status-badge"),
    page.locator("nextjs-portal"),
  ];
}

/** Waits until the web fonts are loaded. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string, extra: Locator[] = []) {
  await settled(page);
  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: [...dates(page), ...extra] });
}

test("the empty workspace list", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New workspace" }).first()).toBeVisible();
  await shot(page, "workspaces-empty.png");
});

test("a workspace list with two workspaces", async ({ api, page }) => {
  await api.createWorkspace({ name: "Platform decisions", description: "Architecture records." });
  await api.createWorkspace({
    name: "Incident reviews",
    description: "Runbooks and post-mortems.",
  });
  await page.goto("/studio");
  await expect(page.getByRole("link", { name: /Platform decisions/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Incident reviews/ })).toBeVisible();
  await shot(page, "workspaces-two.png");
});

test("the documents picker with two documents picked", async ({ api, page }) => {
  const workspace = await api.createWorkspace({ name: "Platform decisions" });
  await openDocuments(page, workspace);
  await pickDocuments(page, [DOCS.runbook, DOCS.decisions]);
  await expect(page.getByRole("checkbox", { name: DOCS.runbook })).toBeChecked();
  await shot(page, "documents-picked.png");
});

test("a new workspace starts empty", async ({ page }) => {
  await createWorkspaceFromDialog(page, "Leave rules");
  await pickDocuments(page, [DOCS.roadmap]);
  await submitDocumentsButton(page).click();
  const heading = page.getByRole("heading", { name: "What do you want from these documents?" });
  await expect(heading).toBeVisible();
  await expect(documentPane(page)).toContainText(/\w/);
  await shot(page, "start.png");
});

test("the working screen with records", async ({ api, page, person, request }) => {
  const workspace = await api.createWorkspace({ name: "Platform decisions" });
  await addDocuments(request, person, workspace, ["platform-adrs.md"]);
  const extraction = new ExtractionPage(page);
  await extraction.open(workspace);
  await extraction.run("Run extraction");
  await extraction.finished();
  await expect(new RecordStripPage(page).position).toHaveText("Record 1 of 3");
  await expect(documentPane(page).locator("mark").first()).toBeVisible();
  await shot(page, "working-screen.png");
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the workspace list", async ({ api, page }) => {
    await api.createWorkspace({ name: "Platform decisions", description: "Architecture records." });
    await api.createWorkspace({
      name: "Incident reviews",
      description: "Runbooks and post-mortems.",
    });
    await page.goto("/studio");
    await expect(page.getByRole("link", { name: /Platform decisions/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Incident reviews/ })).toBeVisible();
    await shot(page, "workspaces-phone.png");
  });
});
