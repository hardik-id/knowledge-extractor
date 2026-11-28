import { type Page, expect } from "@playwright/test";
import type { ApiWorkspace } from "../fixtures";

const CONFIGURATION_KEY = "ke.studio.configuration-open";

/** The browser remembers Configuration as open, unless it remembers a choice already (set before the page loads). */
export async function rememberConfigurationOpen(page: Page) {
  await page.addInitScript((key) => {
    try {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, "open");
    } catch {
      // Storage blocked: the test opens Configuration by hand.
    }
  }, CONFIGURATION_KEY);
}

/**
 * The working screen of a workspace, at the workspace address. Configuration is closed on a first
 * visit; most tests are about what is in it, so by default the browser remembers it open (the way
 * a person who opened it once would find it, and only if nothing was remembered yet). Pass
 * `configuration: "closed"` for the first-visit screen.
 */
export async function openOneScreen(
  page: Page,
  workspace: ApiWorkspace,
  options: { configuration?: "open" | "closed" } = {},
) {
  if ((options.configuration ?? "open") === "open") await rememberConfigurationOpen(page);
  await page.goto(`/studio/workspaces/${workspace.id}`);
  await expectWorkingScreen(page);
}

/** The working screen is up: the top bar with its version text, and the document pane. */
export async function expectWorkingScreen(page: Page) {
  await expect(page.getByTestId("workspace-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
  await expect(documentPane(page)).toBeVisible();
}

/** The column beside the document (from 1100px wide): the Configuration row and the assistant. */
export function fieldColumn(page: Page) {
  return page.getByRole("complementary", { name: "Conversation and configuration" });
}

/** The document pane. */
export function documentPane(page: Page) {
  return page.getByRole("main", { name: "Document" });
}

/** Below 1100px the field column is an overlay: opens it. Nothing to do when it sits beside the document. */
export async function openFields(page: Page) {
  const button = documentPane(page).getByRole("button", { name: "Assistant", exact: true });
  if (await button.isVisible()) await button.click();
  await expect(fieldColumn(page).or(page.getByRole("dialog", { name: "Assistant" }))).toBeVisible();
}

/** The "Configuration" row of the column: a button that says what is configured. */
export function configurationRow(page: Page) {
  return page.getByRole("button", { name: /^Configuration/ });
}

/**
 * Opens the column (below 1100px) and then Configuration, which is closed on a first visit: the
 * prompt, the chunking and the field table are in it. Nothing to do when it is open already.
 */
export async function openConfiguration(page: Page) {
  await openFields(page);
  const row = configurationRow(page);
  await expect(row).toBeVisible();
  await expect(async () => {
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click({ timeout: 2_000 });
    await expect(row).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}
