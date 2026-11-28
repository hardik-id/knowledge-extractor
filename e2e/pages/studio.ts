import { expectWorkingScreen } from "./working-screen";
import {
  type APIRequestContext,
  type Page,
  expect,
  request as playwrightRequest,
} from "@playwright/test";
import type { ApiWorkspace } from "../fixtures";
import { API_BASE_URL } from "../support/env";
import { clickUntilOpen } from "../support/first-click";
import type { Person } from "../support/people";

/** Documents the dev backend always has in its storage container. */
export const DOCS = {
  roadmap: "product-roadmap-2027.md",
  runbook: "incident-runbook.md",
  decisions: "architecture-decisions-2026.md",
} as const;

/** Opens a workspace that has no documents yet: the picker is the whole screen. */
export async function openDocuments(page: Page, workspace: ApiWorkspace) {
  await page.goto(`/studio/workspaces/${workspace.id}`);
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

/** Opens the document picker's sheet from the switcher in the top bar of a workspace with documents. */
export async function openDocumentsSheet(page: Page) {
  const switcher = page
    .getByRole("group", { name: "Document" })
    .getByRole("button", { name: /^Document: / });
  const item = page.getByRole("menuitem", { name: "Add or remove documents" });
  // Radix focuses the menu itself, so the wrapper around it is what holds the focus.
  await clickUntilOpen(page, switcher, page.getByRole("menu").locator("xpath=.."));
  await item.click();
  const sheet = documentsSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Saves the documents picked so far in the open sheet and waits for the answer. */
export async function saveDocuments(page: Page) {
  await documentsSheet(page).getByRole("button", { name: "Save documents" }).click();
  await expect(page.getByText("Documents saved")).toBeVisible();
  await expect(documentsSheet(page)).toBeHidden();
}

/** A workspace with the given documents saved, left on its working screen. */
export async function openExtraction(
  page: Page,
  workspace: ApiWorkspace,
  names: readonly string[],
) {
  await openDocuments(page, workspace);
  await pickDocuments(page, names);
  await submitDocumentsButton(page).click();
  await expectWorkingScreen(page);
  await expect(page).toHaveURL(new RegExp(`/studio/workspaces/${workspace.id}$`));
  await expect(page.getByTestId("workspace-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
}

/** Opens the "New workspace" dialog (the first click after a navigation, see `clickUntilOpen`). */
export async function openNewWorkspaceDialog(page: Page) {
  return clickUntilOpen(
    page,
    page.getByRole("button", { name: "New workspace" }),
    page.getByRole("dialog", { name: "New workspace" }),
  );
}

/** Makes a workspace through the "New workspace" dialog (name only) and waits for it to open. */
export async function createWorkspaceFromDialog(page: Page, name: string) {
  await page.goto("/studio");
  const dialog = await openNewWorkspaceDialog(page);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/studio\/workspaces\/[^/]+$/);
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
    // The trailing slash makes "workspaces" resolve under /api/v1.
    baseURL: `${API_BASE_URL}/`,
    extraHTTPHeaders: person ? { authorization: `Bearer ${person.token}` } : {},
  });
}

/** Puts the test document into the workspace's run, as the person who owns it. */
export async function addDocument(person: Person, runId: string) {
  const request = await apiAs(person);
  try {
    const response = await request.put(`runs/${runId}/documents`, { data: { items: [DOCUMENT] } });
    expect(response.ok(), `adding the document answered ${response.status()}`).toBe(true);
  } finally {
    await request.dispose();
  }
}

/** A workspace's one address: the picker without documents, the working screen with them. */
export function extractPath(workspaceId: string) {
  return `/studio/workspaces/${workspaceId}`;
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

/** A new workspace from the dialog, with one document picked, opened on the working screen: the start panel. */
export async function openStart(page: Page, name = "Start workspace") {
  await createWorkspaceFromDialog(page, name);
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
  await pickDocuments(page, [DOCS.roadmap]);
  await submitDocumentsButton(page).click();
  await expectWorkingScreen(page);
  // Below 1100px the column is an overlay, opened by "Fields": the panel is not on show yet.
  if ((page.viewportSize()?.width ?? 0) >= 1100) {
    await expect(
      page.getByRole("heading", { name: "What do you want from these documents?" }),
    ).toBeVisible();
  }
}
