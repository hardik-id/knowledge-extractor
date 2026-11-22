import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, addDocuments, projectWithDocuments } from "./pages/extraction";
import { DOCS, createProjectFromDialog, openDocuments, pickDocuments } from "./pages/studio";

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
 * So does the dev server's own badge ("Cache disabled"), which is not part of the app.
 */
function dates(page: Page): Locator[] {
  return [page.locator("time"), page.getByTestId("version-line"), page.locator("nextjs-portal")];
}

/** Waits until the web fonts are loaded. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function shot(page: Page, name: string, extra: Locator[] = []) {
  await settled(page);
  await expect(page).toHaveScreenshot(name, { ...SHOT, mask: [...dates(page), ...extra] });
}

test("the empty project list", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" }).first()).toBeVisible();
  await shot(page, "projects-empty.png");
});

test("a project list with two projects", async ({ api, page }) => {
  await api.createProject({ name: "Platform decisions", description: "Architecture records." });
  await api.createProject({ name: "Incident reviews", description: "Runbooks and post-mortems." });
  await page.goto("/studio");
  await expect(page.getByRole("link", { name: /Platform decisions/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Incident reviews/ })).toBeVisible();
  await shot(page, "projects-two.png");
});

test("the Documents page with two documents picked", async ({ api, page }) => {
  const project = await api.createProject({ name: "Platform decisions" });
  await openDocuments(page, project);
  await pickDocuments(page, [DOCS.runbook, DOCS.decisions]);
  await expect(page.getByRole("checkbox", { name: DOCS.runbook })).toBeChecked();
  await shot(page, "documents-picked.png");
});

test("the Define tab", async ({ api, page, person, request }) => {
  const project = await projectWithDocuments(api, person, request, [
    "platform-adrs.md",
    "incident-runbook.md",
  ]);
  const extraction = new ExtractionPage(page);
  await extraction.open(project);
  await expect(page.getByTestId("version-line")).toBeVisible();
  await shot(page, "define.png");
});

test("a new project starts empty", async ({ page }) => {
  await createProjectFromDialog(page, "Leave rules");
  await pickDocuments(page, [DOCS.roadmap]);
  await page.getByRole("button", { name: "Open in extraction" }).click();
  const heading = page.getByRole("heading", { name: "What do you want from these documents?" });
  await expect(heading).toBeVisible();
  await expect(page.getByTestId("start-document")).toContainText(/\w/);
  await shot(page, "start.png");
});

test("the Review tab with records", async ({ api, page, person, request }) => {
  const project = await api.createProject({ name: "Platform decisions" });
  await addDocuments(request, person, project, ["platform-adrs.md"]);
  const extraction = new ExtractionPage(page);
  await extraction.open(project);
  await extraction.run("Run extraction");
  await extraction.finished();
  await extraction.openTab("Review");
  await expect(extraction.record("Use feature flags for risky releases")).toBeVisible();
  await expect(extraction.summary()).toHaveText("3 records · 3 suggested");
  await shot(page, "review.png");
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the project list", async ({ api, page }) => {
    await api.createProject({ name: "Platform decisions", description: "Architecture records." });
    await api.createProject({
      name: "Incident reviews",
      description: "Runbooks and post-mortems.",
    });
    await page.goto("/studio");
    await expect(page.getByRole("link", { name: /Platform decisions/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Incident reviews/ })).toBeVisible();
    await shot(page, "projects-phone.png");
  });
});
