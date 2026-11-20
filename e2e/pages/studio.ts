import { expect, type Page } from "@playwright/test";
import type { ApiProject } from "../fixtures";

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

/** Opens the "New project" dialog. A click before the page has hydrated does nothing, so it is repeated until the dialog shows. */
export async function openNewProjectDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(async () => {
    await page.getByRole("button", { name: "New project" }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}
