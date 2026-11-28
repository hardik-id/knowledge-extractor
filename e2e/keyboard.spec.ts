import { type Page } from "@playwright/test";
import { openTemplatesDialog, openVersionHistory } from "./pages/extraction";
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

test("from the workspace list, a workspace opens and 'Run on this document' is reached with Tab and Enter", async ({
  api,
  page,
  person,
}) => {
  const workspace = await api.createWorkspace({ name: "Keyboard workspace" });
  await addDocument(person, workspace.run_id);

  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Keyboard workspace" })).toBeVisible();

  await tabTo(page, "Keyboard workspace");
  await expect(page.getByRole("link", { name: "Keyboard workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(extractPath(workspace.id));

  const run = page.getByRole("button", { name: "Run on this document" });
  await expect(run).toBeVisible();
  // The top bar comes first: the workspace menu, then Run, and only then the working screen.
  await tabTo(page, "Keyboard workspace");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Keyboard workspace" })).toBeFocused();
  await tabTo(page, "Run on this document");
  await expect(run).toBeFocused();
  await page.keyboard.press("Enter");

  // Enter ran it: the records are in, and the button says so.
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Found in this record" })).toBeVisible();
});

test("focus returns to the version text after Version history and to More after Templates close", async ({
  api,
  page,
  person,
}) => {
  const workspace = await api.createWorkspace({ name: "Focus workspace" });
  await addDocument(person, workspace.run_id);
  await page.goto(extractPath(workspace.id));

  const version = page.getByRole("button", { name: /^(Version \d|Nothing saved yet)/ });
  await expect(version).toBeVisible();
  const history = await openVersionHistory(page);
  await expect(history).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history).toHaveCount(0);
  await expect(version).toBeFocused();

  const templates = await openTemplatesDialog(page);
  await page.keyboard.press("Escape");
  await expect(templates).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More", exact: true })).toBeFocused();
});
