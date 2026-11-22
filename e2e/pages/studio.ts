import {
  type APIRequestContext,
  type Page,
  expect,
  request as playwrightRequest,
} from "@playwright/test";
import type { ApiProject } from "../fixtures";
import { API_BASE_URL } from "../support/env";
import { clickUntilOpen } from "../support/first-click";
import type { Person } from "../support/people";

/** Documents the dev backend always has in its storage container. */
export const DOCS = {
  roadmap: "product-roadmap-2027.md",
  runbook: "incident-runbook.md",
  decisions: "architecture-decisions-2026.md",
} as const;

/** Opens a project that has no documents yet: the picker is the whole screen. */
export async function openDocuments(page: Page, project: ApiProject) {
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
}

export async function pickDocuments(page: Page, names: readonly string[]) {
  for (const name of names) {
    await page.getByRole("checkbox", { name }).check();
  }
}

/** The one action of the picker screen: "Use 2 documents", or "Use documents" with none picked. */
export function submitDocumentsButton(page: Page) {
  return page.getByRole("button", { name: /^Use .*documents?$/ });
}

/** The sheet "Add or remove documents" opens from the document switcher. */
export function documentsSheet(page: Page) {
  return page.getByRole("dialog", { name: "Add or remove documents" });
}

/** Opens the document picker's sheet from the switcher in the top bar of a project with documents. */
export async function openDocumentsSheet(page: Page) {
  const sheet = documentsSheet(page);
  // The first click after a navigation can be lost while the page settles: try again.
  await expect(async () => {
    if (!(await sheet.isVisible())) {
      const item = page.getByRole("menuitem", { name: "Add or remove documents" });
      if (!(await item.isVisible())) {
        await page
          .getByRole("group", { name: "Document" })
          .getByRole("button", { name: /^Document: / })
          .click({ timeout: 2_000 });
      }
      await item.click({ timeout: 2_000 });
    }
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return sheet;
}

/** Saves the documents picked so far in the open sheet and waits for the answer. */
export async function saveDocuments(page: Page) {
  await documentsSheet(page).getByRole("button", { name: "Save documents" }).click();
  await expect(page.getByText("Documents saved")).toBeVisible();
  await expect(documentsSheet(page)).toBeHidden();
}

/** A project with the given documents saved, left on its workspace. */
export async function openExtraction(page: Page, project: ApiProject, names: readonly string[]) {
  await openDocuments(page, project);
  await pickDocuments(page, names);
  await submitDocumentsButton(page).click();
  await expect(page.getByRole("tab", { name: "Define" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/studio/projects/${project.id}$`));
  await expect(page.getByTestId("project-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
}

/** Opens the "New project" dialog (the first click after a navigation, see `clickUntilOpen`). */
export async function openNewProjectDialog(page: Page) {
  return clickUntilOpen(
    page,
    page.getByRole("button", { name: "New project" }),
    page.getByRole("dialog", { name: "New project" }),
  );
}

/** Makes a project through the "New project" dialog (name only) and waits for it to open. */
export async function createProjectFromDialog(page: Page, name: string) {
  await page.goto("/studio");
  const dialog = await openNewProjectDialog(page);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/studio\/projects\/[^/]+$/);
}

/** A document the backend's storage container lists for every person. */
export const DOCUMENT = {
  source: "storage",
  source_ref: "enriched/engineering/architecture/architecture-decisions-2026.md",
  name: "architecture-decisions-2026.md",
  type: "md",
  size_bytes: 4120,
  location: "enriched / engineering / architecture",
  modified_at: "2026-08-30T16:22:00Z",
};

/**
 * A request context for the API as `person`, for the things a test checks or sets up
 * outside the browser. Call `dispose()` when done. Unlike the `api` fixture it can
 * act as another person, and it does not throw on 4xx.
 */
export async function apiAs(person: Person | null): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    // The trailing slash makes "projects" resolve under /api/v1.
    baseURL: `${API_BASE_URL}/`,
    extraHTTPHeaders: person ? { authorization: `Bearer ${person.token}` } : {},
  });
}

/** Puts the test document into the project's run, as the person who owns it. */
export async function addDocument(person: Person, runId: string) {
  const request = await apiAs(person);
  try {
    const response = await request.put(`runs/${runId}/documents`, { data: { items: [DOCUMENT] } });
    expect(response.ok(), `adding the document answered ${response.status()}`).toBe(true);
  } finally {
    await request.dispose();
  }
}

/** A project's one address: the picker without documents, the workspace with them. */
export function extractPath(projectId: string) {
  return `/studio/projects/${projectId}`;
}

/** The three tabs of the workspace, and the tab panel the page shows for each. */
export const TABS = ["Define", "Review", "Output"] as const;

export function tab(page: Page, name: (typeof TABS)[number]) {
  return page.getByRole("tab", { name });
}

/** True when the page scrolls sideways (the document is wider than the window). */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** True when something inside `box` scrolls (it has more content than room). */
export async function hasInnerScroll(box: import("@playwright/test").Locator): Promise<boolean> {
  return box.evaluate((root) =>
    [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].some(
      (el) =>
        el.scrollHeight > el.clientHeight + 1 &&
        ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
    ),
  );
}
