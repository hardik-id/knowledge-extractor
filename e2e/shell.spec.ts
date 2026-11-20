import { addDocument } from "./pages/studio";
import { expect, test } from "./fixtures";

test.describe("on a desktop", () => {
  // Short enough that the compact document table still has to scroll.
  test.use({ viewport: { width: 1280, height: 480 } });

  test("the page header stays in view while the content scrolls, and nothing scrolls sideways", async ({
    api,
    page,
  }) => {
    const project = await api.createProject({ name: "Shell project" });
    await page.goto(`/studio/projects/${project.id}`);
    const title = page.getByRole("heading", { name: "Documents", level: 1 });
    await expect(title).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeVisible();

    const before = await title.boundingBox();
    const scrolled = await page.evaluate(() => {
      const region = Array.from(document.querySelectorAll<HTMLElement>("main *")).find(
        (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto",
      );
      if (!region) return 0;
      region.scrollTop = region.scrollHeight;
      return region.scrollTop;
    });
    expect(scrolled, "the content scrolls under the header").toBeGreaterThan(0);
    const after = await title.boundingBox();
    expect(after?.y).toBe(before?.y);
    await expect(page.getByRole("button", { name: "Open in extraction" })).toBeInViewport();

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "the page scrolls sideways").toBeLessThanOrEqual(0);
  });

  test("Skip to content works, and Tab goes sidebar, header actions, content", async ({
    api,
    page,
    person,
  }) => {
    const project = await api.createProject({ name: "Tab order project" });
    await addDocument(person, project.run_id);
    await page.goto(`/studio/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);

    // From the top, the order is: sidebar, then the header's actions, then the content.
    await page.goto(`/studio/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
    // The first stop is the skip link; the order is read from the second.
    await page.keyboard.press("Tab");
    const order: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return "none";
          if (el.closest("aside")) return "sidebar";
          if (el.closest("header")) return "header";
          return "content";
        }),
      );
    }
    const firstHeader = order.indexOf("header");
    const firstContent = order.indexOf("content");
    expect(order.indexOf("sidebar"), order.join()).toBe(0);
    expect(firstHeader, order.join()).toBeGreaterThan(order.lastIndexOf("sidebar"));
    expect(firstContent, order.join()).toBeGreaterThan(firstHeader);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the steps menu opens and closes by touch and by keyboard, with no sideways scroll", async ({
    api,
    page,
    person,
  }) => {
    const project = await api.createProject({ name: "Phone menu project" });
    await addDocument(person, project.run_id);
    await page.goto(`/studio/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();

    const menu = page.getByRole("button", { name: "Documents" }).first();
    const steps = page.getByRole("dialog");

    await menu.tap();
    await expect(steps).toBeVisible();
    await expect(steps.getByRole("link", { name: "Extraction" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(steps).toBeHidden();

    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(steps).toBeVisible();
    await steps.getByRole("link", { name: "Extraction" }).press("Enter");
    await expect(page).toHaveURL(/\/extract$/);
    await expect(steps).toBeHidden();

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "the page scrolls sideways").toBeLessThanOrEqual(0);
  });
});
