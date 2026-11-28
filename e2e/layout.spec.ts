import { type Page } from "@playwright/test";
import { addDocument, extractPath } from "./pages/studio";
import { expectWorkingScreen } from "./pages/working-screen";
import { expect, test } from "./fixtures";
import { editPrompt } from "./pages/extraction";

/** How much taller the document is than the window (0 when the page cannot scroll). */
function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
}

/** The height of a project's top bar: 48px when it is one row. */
async function barHeight(page: Page): Promise<number> {
  return (await page.getByTestId("project-top-bar").boundingBox())?.height ?? 0;
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1360, height: 900 },
  { width: 1440, height: 900 },
]) {
  test.describe(`at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    test("the page never scrolls into empty space", async ({
      api,
      expectApiError,
      page,
      person,
    }) => {
      // The document of a file nobody has extracted yet: "extraction_not_found" is how the API says so.
      expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
      const project = await api.createProject({ name: "Layout project" });
      await addDocument(person, project.run_id);

      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
      expect(await overflow(page), "the project list").toBeLessThanOrEqual(0);

      const empty = await api.createProject({ name: "Layout empty project" });
      await page.goto(`/studio/projects/${empty.id}`);
      await expect(page.getByTestId("project-top-bar")).toBeVisible();
      expect(await overflow(page), "the Documents page").toBeLessThanOrEqual(0);
      expect(await barHeight(page), "the top bar on the Documents page is one row").toBeLessThan(
        56,
      );

      await page.goto(extractPath(project.id));
      await expectWorkingScreen(page);
      expect(await barHeight(page), "the top bar on the working screen").toBeLessThan(90);
      // With unsaved changes the version text is longer: the bar stays one row.
      await editPrompt(page, "Something else to extract");
      await expect(page.getByTestId("version-line")).toContainText("unsaved changes");
      expect(await barHeight(page), "the top bar with unsaved changes is one row").toBeLessThan(56);
      for (const name of ["Output", "Document"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        expect(await overflow(page), `the ${name} view`).toBeLessThanOrEqual(0);
      }
    });
  });
}

test.describe("at 1024 x 768", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("the top bar stays short on the working screen", async ({ api, page, person }) => {
    const project = await api.createProject({ name: "Mid width project" });
    await addDocument(person, project.run_id);
    await page.goto(extractPath(project.id));
    await expectWorkingScreen(page);
    expect(await barHeight(page), "the bar at 1024").toBeLessThan(120);
    expect(await overflow(page), "the page").toBeLessThanOrEqual(0);
  });
});

test.describe("at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the top bar stays a quarter of the screen at most", async ({ api, page, person }) => {
    const project = await api.createProject({ name: "Phone bar project" });
    await addDocument(person, project.run_id);
    await page.goto(extractPath(project.id));
    await expectWorkingScreen(page);
    expect(await barHeight(page), "the bar at 390").toBeLessThan(844 * 0.25);
  });

  test("scrolling to the end shows the end of the content", async ({ api, page, person }) => {
    const project = await api.createProject({ name: "Phone layout project" });
    await addDocument(person, project.run_id);
    await page.goto(extractPath(project.id));
    await expectWorkingScreen(page);

    // The last thing in the page, whatever it is, ends no more than ~48px above the document's end.
    const gap = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      let bottom = 0;
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) bottom = Math.max(bottom, r.bottom + window.scrollY);
      }
      return document.documentElement.scrollHeight - bottom;
    });
    expect(gap, "empty space under the content").toBeLessThanOrEqual(48);
  });
});
