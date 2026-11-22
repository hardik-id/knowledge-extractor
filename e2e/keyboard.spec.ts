import { type Page } from "@playwright/test";
import { addDocument, extractPath } from "./pages/studio";
import { expect, test } from "./fixtures";

/** Presses Tab until `target` has focus; fails with where the focus went if it never does. */
async function tabTo(page: Page, name: string, limit = 60) {
  const visited: string[] = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      return el
        ? `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}`
        : "nothing";
    });
    visited.push(label);
    if (label.split(" ").slice(1).join(" ") === name) return;
  }
  throw new Error(
    `Tab never reached "${name}" in ${limit} presses. Focus went: ${visited.join(" | ")}`,
  );
}

test("from the project list, a project opens and 'Run extraction' is reached with Tab and Enter", async ({
  api,
  page,
  person,
}) => {
  const project = await api.createProject({ name: "Keyboard project" });
  await addDocument(person, project.run_id);

  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Keyboard project" })).toBeVisible();

  await tabTo(page, "Keyboard project");
  await expect(page.getByRole("link", { name: "Keyboard project" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(extractPath(project.id));

  const run = page.getByRole("button", { name: "Run extraction" });
  await expect(run).toBeVisible();
  // The top bar comes first: the project menu, then Run, and only then the tabs.
  await tabTo(page, "Keyboard project");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Keyboard project" })).toBeFocused();
  await tabTo(page, "Run extraction");
  await expect(run).toBeFocused();
  await expect(page.getByRole("tab", { name: "Define" })).not.toBeFocused();
  await page.keyboard.press("Enter");

  // Enter ran it: the Review tab opens with the records.
  await expect(page.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
});
