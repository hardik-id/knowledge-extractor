import { type Page } from "@playwright/test";
import { addDocument, extractPath, tab, TABS } from "./pages/studio";
import { expect, test } from "./fixtures";

/** How much taller the document is than the window (0 when the page cannot scroll). */
function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  );
}

for (const size of [
  { width: 1280, height: 800 },
  { width: 1360, height: 900 },
]) {
  test.describe(`at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    test("the page never scrolls into empty space", async ({
      api,
      expectApiError,
      page,
      person,
    }) => {
      // The Review tab of a file nobody has extracted yet: "extraction_not_found" is how the API says so.
      expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
      const project = await api.createProject({ name: "Layout project" });
      await addDocument(person, project.run_id);

      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
      expect(await overflow(page), "the project list").toBeLessThanOrEqual(0);

      await page.goto(`/studio/projects/${project.id}`);
      await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
      expect(await overflow(page), "the Documents page").toBeLessThanOrEqual(0);

      await page.goto(extractPath(project.id));
      for (const name of TABS) {
        await tab(page, name).click();
        await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
        expect(await overflow(page), `the ${name} tab`).toBeLessThanOrEqual(0);
      }
    });
  });
}

test.describe("at 390 x 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("scrolling to the end shows the end of the content", async ({ api, page, person }) => {
    const project = await api.createProject({ name: "Phone layout project" });
    await addDocument(person, project.run_id);
    await page.goto(extractPath(project.id));
    await expect(tab(page, "Define")).toBeVisible();

    // The last thing in the page, whatever it is, ends no more than ~48px above the document's end.
    const gap = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      let bottom = 0;
      for (const el of document.querySelectorAll("main *")) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) bottom = Math.max(bottom, r.bottom + window.scrollY);
      }
      return document.documentElement.scrollHeight - bottom;
    });
    expect(gap, "empty space under the content").toBeLessThanOrEqual(48);
  });
});
