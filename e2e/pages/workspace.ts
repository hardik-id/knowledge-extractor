import { type Page, expect } from "@playwright/test";
import type { ApiProject } from "../fixtures";

/** The working screen of a project, at its preview address. Only item 11 edits this file. */
export async function openOneScreen(page: Page, project: ApiProject) {
  await page.goto(`/studio/projects/${project.id}/preview`);
  await expect(page.getByTestId("project-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
}

/** The field column beside the document (from 1100px wide). */
export function fieldColumn(page: Page) {
  return page.getByRole("complementary", { name: "Fields" });
}

/** The document pane. */
export function documentPane(page: Page) {
  return page.getByRole("main", { name: "Document" });
}
