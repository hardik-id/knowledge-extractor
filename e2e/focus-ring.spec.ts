import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ExtractionPage, projectWithDocuments } from "./pages/extraction";
import { openDocuments } from "./pages/studio";

/**
 * Focus is always visible: walking through a screen with the Tab key, every element that takes
 * focus shows the 2px ring in the `focus-ring` colour, in both themes.
 */

/** Tabs through the page and returns what took focus without a ring. */
async function withoutRing(page: Page, steps: number): Promise<string[]> {
  const missing: string[] = [];
  await page.locator("body").press("Tab");
  for (let i = 0; i < steps; i++) {
    const found = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const ring = getComputedStyle(document.documentElement)
        .getPropertyValue("--focus-ring")
        .trim();
      const probe = document.createElement("span");
      probe.style.color = ring;
      document.body.append(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      // A visually hidden radio or checkbox shows its focus on the label around it.
      const box = el.getBoundingClientRect();
      const hidden = el instanceof HTMLInputElement && (box.width <= 1 || box.height <= 1);
      const style = getComputedStyle((hidden && el.closest("label")) || el);
      const ok =
        style.outlineStyle === "solid" &&
        style.outlineWidth === "2px" &&
        style.outlineColor === expected;
      const name =
        el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName;
      return ok ? "ok" : `${el.tagName.toLowerCase()} "${name}"`;
    });
    if (found && found !== "ok") missing.push(found);
    await page.keyboard.press("Tab");
  }
  return missing;
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`focus ring, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the Documents page", async ({ api, page }) => {
      const project = await api.createProject({ name: "Focus project" });
      await openDocuments(page, project);
      await expect(page.getByRole("checkbox").first()).toBeVisible();
      expect(await withoutRing(page, 14)).toEqual([]);
    });

    test("the Define tab", async ({ api, page, person, request }) => {
      const project = await projectWithDocuments(api, person, request, ["platform-adrs.md"]);
      await new ExtractionPage(page).open(project);
      await expect(page.getByTestId("version-line")).toBeVisible();
      expect(await withoutRing(page, 30)).toEqual([]);
    });

    test("the Format control shows focus on the chosen option", async ({
      api,
      page,
      person,
      request,
    }) => {
      const project = await projectWithDocuments(api, person, request, ["platform-adrs.md"]);
      await new ExtractionPage(page).open(project);
      const radio = page.getByRole("radio", { name: "Markdown" });
      await radio.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const label = page.locator("label", { has: radio });
      await expect(label).toHaveCSS("outline-style", "solid");
      await expect(label).toHaveCSS("outline-width", "2px");
      // The ring must differ from the colour it is drawn on. The chosen option's fill is the
      // link colour, which in the light theme is the focus-ring colour itself, so an inset ring
      // would vanish: the ring sits outside the label, on what is behind the control.
      const colours = await label.evaluate((el) => {
        const style = getComputedStyle(el);
        const inset = parseFloat(style.outlineOffset) < 0;
        let behind: Element | null = inset ? el : el.parentElement;
        let backdrop = "rgba(0, 0, 0, 0)";
        while (behind) {
          const bg = getComputedStyle(behind).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
            backdrop = bg;
            break;
          }
          behind = behind.parentElement;
        }
        return { ring: style.outlineColor, inset, backdrop };
      });
      expect(colours.inset).toBe(false);
      expect(colours.ring).not.toBe(colours.backdrop);
    });
  });
}
