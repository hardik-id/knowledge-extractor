import { type Page, expect } from "@playwright/test";
import type { ApiProject } from "../fixtures";

/** The working screen of a project, at the project address. */
export async function openOneScreen(page: Page, project: ApiProject) {
  await page.goto(`/studio/projects/${project.id}`);
  await expectWorkingScreen(page);
}

/** The working screen is up: the top bar with its version text, and the document pane. */
export async function expectWorkingScreen(page: Page) {
  await expect(page.getByTestId("project-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
  await expect(documentPane(page)).toBeVisible();
}

/** The field column beside the document (from 1100px wide). */
export function fieldColumn(page: Page) {
  return page.getByRole("complementary", { name: "Fields" });
}

/** The document pane. */
export function documentPane(page: Page) {
  return page.getByRole("main", { name: "Document" });
}

/** Below 1100px the field column is an overlay: opens it. Nothing to do when it sits beside the document. */
export async function openFields(page: Page) {
  const button = page.getByRole("button", { name: "Fields", exact: true });
  if (await button.isVisible()) await button.click();
  await expect(fieldColumn(page).or(page.getByRole("dialog", { name: "Fields" }))).toBeVisible();
}
