import { expectWorkingScreen } from "./pages/working-screen";
import { type Page } from "@playwright/test";
import { addDocument, submitDocumentsButton } from "./pages/studio";
import { expect, test } from "./fixtures";

/** True when the page scrolls sideways. */
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("on a desktop", () => {
  // Short enough that the compact document table still has to scroll.
  test.use({ viewport: { width: 1280, height: 480 } });

  test("the top bar stays in view while the content scrolls, and nothing scrolls sideways", async ({
    api,
    page,
  }) => {
    const project = await api.createProject({ name: "Shell project" });
    await page.goto(`/studio/projects/${project.id}`);
    const bar = page.getByTestId("project-top-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await expect(
      page.locator('aside[aria-label="Studio"]'),
      "no sidebar under a project",
    ).toHaveCount(0);

    const before = await bar.boundingBox();
    const scrolled = await page.evaluate(() => {
      const region = Array.from(document.querySelectorAll<HTMLElement>("main *")).find(
        (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto",
      );
      if (!region) return 0;
      region.scrollTop = region.scrollHeight;
      return region.scrollTop;
    });
    expect(scrolled, "the content scrolls under the top bar").toBeGreaterThan(0);
    const after = await bar.boundingBox();
    expect(after?.y).toBe(before?.y);
    await expect(submitDocumentsButton(page)).toBeInViewport();

    expect(await sideways(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  });

  test("the project list keeps its sidebar", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    const sidebar = page.getByRole("complementary", { name: "Studio" });
    await expect(sidebar.getByText("Open a project, or start a new one.")).toBeVisible();
  });

  test("Skip to content works, and Tab goes top bar, then content", async ({
    api,
    page,
    person,
  }) => {
    const project = await api.createProject({ name: "Tab order project" });
    await addDocument(person, project.run_id);
    await page.goto(`/studio/projects/${project.id}`);
    await expect(page.getByTestId("project-top-bar")).toBeVisible();

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#project-content$/);
    // The next Tab is past the bar: the skip really skips it.
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("[data-testid=project-top-bar]")),
      "focus after the skip is still in the top bar",
    ).toBe(false);

    // From the top, the order is: the top bar, then the content.
    await page.goto(`/studio/projects/${project.id}`);
    await expect(page.getByTestId("project-top-bar")).toBeVisible();
    // The first stop is the skip link; the order is read from the second.
    await page.keyboard.press("Tab");
    const order: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return "none";
          if (el.closest('aside[aria-label="Studio"]')) return "sidebar";
          if (el.closest("[data-testid=project-top-bar]")) return "bar";
          return "content";
        }),
      );
    }
    expect(order.indexOf("bar"), order.join()).toBe(0);
    expect(order, order.join()).not.toContain("sidebar");
    expect(order.indexOf("content"), order.join()).toBeGreaterThan(order.lastIndexOf("bar"));
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the top bar wraps, its project menu opens and closes by touch and by keyboard, with no sideways scroll", async ({
    api,
    page,
    person,
  }) => {
    const project = await api.createProject({ name: "Phone menu project" });
    await addDocument(person, project.run_id);
    await page.goto(`/studio/projects/${project.id}`);
    const bar = page.getByTestId("project-top-bar");
    await expect(bar).toBeVisible();
    // The Studio sidebar, not any aside: the assistant panel is one too.
    await expect(page.locator('aside[aria-label="Studio"]')).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "Projects" })).toBeInViewport({ ratio: 1 });

    const menu = bar.getByRole("button", { name: "Phone menu project" });
    await expect(menu).toBeInViewport({ ratio: 1 });
    const items = page.getByRole("menu");

    await menu.tap();
    await expect(items.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(items.getByRole("menuitem", { name: "Edit description" })).toBeVisible();
    await expect(items.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(items).toBeHidden();

    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(items).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(items).toBeHidden();

    // With documents the project shows its workspace, where the bar carries more and wraps: still no sideways scroll.
    await expectWorkingScreen(page);
    await expect(
      page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ }),
    ).toBeVisible();
    expect(await sideways(page), "the page scrolls sideways").toBeLessThanOrEqual(0);
  });
});
