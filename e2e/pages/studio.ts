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

/** Opens a project's Documents page and picks the documents by name. */
export async function openDocuments(page: Page, project: ApiProject) {
  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
}

export async function pickDocuments(page: Page, names: readonly string[]) {
  for (const name of names) {
    await page.getByRole("checkbox", { name }).check();
  }
}

/** Saves the documents picked so far and waits for the answer. */
export async function saveDocuments(page: Page) {
  await page.getByRole("button", { name: "Save documents" }).click();
  await expect(page.getByText("Documents saved")).toBeVisible();
}

/** A project with the given documents saved, left on the extraction page. */
export async function openExtraction(page: Page, project: ApiProject, names: readonly string[]) {
  await openDocuments(page, project);
  await pickDocuments(page, names);
  await page.getByRole("button", { name: "Open in extraction" }).click();
  await expect(page).toHaveURL(/\/extract$/);
  await expect(page.getByRole("heading", { name: "Knowledge extraction", level: 1 })).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
}

/** Changes the "What to extract" text, which leaves the configuration with unsaved changes. */
export async function editPrompt(page: Page, text: string) {
  await page.getByLabel("What to extract").fill(text);
}

export async function saveConfiguration(page: Page, note?: string) {
  await page.getByRole("button", { name: "Save configuration" }).click();
  const form = page.getByRole("form", { name: "Save configuration" });
  if (note) await form.getByLabel("Note (optional)").fill(note);
  await form.getByRole("button", { name: "Save", exact: true }).click();
}

/** Opens the "New project" dialog (the first click after a navigation, see `clickUntilOpen`). */
export async function openNewProjectDialog(page: Page) {
  return clickUntilOpen(
    page,
    page.getByRole("button", { name: "New project" }),
    page.getByRole("dialog", { name: "New project" }),
  );
}

/**
 * Makes a project through the "New project" dialog and waits for it to open.
 * `template` is the name of the choice under "Start from"; without it the picker is not touched.
 */
export async function createProjectFromDialog(page: Page, name: string, template?: string) {
  await page.goto("/studio");
  const dialog = await openNewProjectDialog(page);
  await dialog.getByLabel("Name").fill(name);
  if (template) {
    await dialog.getByRole("radio", { name: new RegExp(`^${template}`) }).check();
  }
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

/** The extraction page of a project (the address the project list links to once it has documents). */
export function extractPath(projectId: string) {
  return `/studio/projects/${projectId}/extract`;
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
