import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { API_BASE_URL, API_ORIGIN } from "../support/env";
import type { Api, ApiProject, Person } from "../fixtures";
import { clickUntilOpen } from "../support/first-click";
import { openOneScreen } from "./workspace";

interface ApiDocument {
  id: string;
  name: string;
  source: string;
  type: string;
  size_bytes: number;
  location: string;
  modified_at: string;
}

/** Puts documents (by file name) into the project's run, as the person, without clicking. */
export async function addDocuments(
  request: APIRequestContext,
  person: Person,
  project: ApiProject,
  names: string[],
) {
  const headers = { authorization: `Bearer ${person.token}` };
  const list = await request.get(`${API_BASE_URL}/documents`, { headers });
  expect(list.ok()).toBeTruthy();
  const documents = ((await list.json()) as { items: ApiDocument[] }).items;
  const items = names.map((name) => {
    const found = documents.find((d) => d.name === name);
    if (!found) throw new Error(`The storage has no document named ${name}`);
    return {
      source: found.source,
      source_ref: found.id,
      name: found.name,
      type: found.type,
      size_bytes: found.size_bytes,
      location: found.location,
      modified_at: found.modified_at,
    };
  });
  const put = await request.put(`${API_BASE_URL}/runs/${project.run_id}/documents`, {
    headers,
    data: { items },
  });
  expect(put.ok(), `PUT documents answered ${put.status()}`).toBeTruthy();
}

/** A new project holding the named documents (the run's files), ready to open in extraction. */
export async function projectWithDocuments(
  api: Api,
  person: Person,
  request: APIRequestContext,
  names: string[],
) {
  const project = await api.createProject({ name: "Journey project" });
  await addDocuments(request, person, project, names);
  return project;
}

/** The extraction workspace of a project. */
export class ExtractionPage {
  /** The run of the open project, noted from the first request the page makes for it. */
  private runId: string | null = null;

  constructor(readonly page: Page) {
    page.on("request", (request) => {
      const match = /^\/api\/v1\/runs\/([^/?]+)/.exec(new URL(request.url()).pathname);
      if (!match || !request.url().startsWith(API_ORIGIN)) return;
      this.runId ??= match[1];
    });
  }

  /** Opens the project's working screen. */
  async open(project: ApiProject) {
    await openOneScreen(this.page, project);
  }

  /** The one Run button of the top bar: "Run on this document", "Run on all N documents" or "Run again". */
  get runButton() {
    return this.page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ });
  }

  /**
   * Starts a run with the Run button. The progress arrives live: the tests wait for `finished()`,
   * never reload. It waits for the backend to accept the run (the answer stays true; the
   * "Running" badge is gone as soon as a fast run ends), not for a badge. `label` is checked
   * when given; the button is found by role, whatever it says.
   */
  async run(label?: string | RegExp) {
    const button = this.runButton;
    if (label instanceof RegExp) await expect(button).toHaveAccessibleName(label);
    else if (label && /^Run (on|again)/.test(label))
      await expect(button).toHaveAccessibleName(label);
    const accepted = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/stages\/extract\/executions$/.test(new URL(response.url()).pathname),
    );
    await button.click();
    expect((await accepted).ok(), "the backend accepted the run").toBe(true);
  }

  /** Starts a run on every document, from the menu next to the Run button. */
  async runAll() {
    const accepted = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/stages\/extract\/executions$/.test(new URL(response.url()).pathname),
    );
    await this.page.getByRole("button", { name: "Other ways to run" }).click();
    await this.page.getByRole("menuitem", { name: /^Run on all \d+ documents$/ }).click();
    expect((await accepted).ok(), "the backend accepted the run").toBe(true);
  }

  /**
   * The run is over: no extract cell of the run is queued or running (read from the API from inside
   * the page, as the screen no longer has a badge to wait for), and Run is enabled again.
   */
  async finished() {
    const runId = this.runId;
    if (!runId) throw new Error("finished(): the page has made no request for its run yet");
    await expect
      .poll(
        async () => {
          // From inside the page: the fixtures put the person's token on the page's own requests
          // only, so `page.request` (a separate client) would be refused with a 401.
          const run = await this.page.evaluate(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
            return (await response.json()) as { cells: { stage: string; status: string }[] };
          }, `${API_BASE_URL}/runs/${runId}`);
          return run.cells.filter(
            (cell) =>
              cell.stage === "extract" && (cell.status === "queued" || cell.status === "running"),
          ).length;
        },
        { timeout: 30_000, message: "extract cells still queued or running" },
      )
      .toBe(0);
    await expect(this.runButton).toBeEnabled();
  }

  /** The version text of the top bar: the button that opens the version menu. */
  get versionMenu() {
    return this.page.getByRole("button", { name: /^(Version \d|Nothing saved yet)/ });
  }

  async saveConfiguration(note: string) {
    await saveConfiguration(this.page, note);
    await expect(this.page.getByTestId("version-line")).not.toContainText("unsaved changes");
  }
}

/** The "What to extract" line of the column: a button until it is clicked, then a text box. */
export function promptLine(page: Page) {
  return page.getByRole("button", { name: /^What to extract/ });
}

/** Changes the "What to extract" text, which leaves the configuration with unsaved changes. */
export async function editPrompt(page: Page, text: string) {
  await promptLine(page).click();
  const box = page.getByRole("textbox", { name: "What to extract" });
  await box.fill(text);
  // Esc closes the box and keeps what was typed in the draft.
  await box.press("Escape");
  await expect(box).toHaveCount(0);
}

/** Opens the version menu in the top bar (the version text). */
export async function openVersionMenu(page: Page) {
  return clickUntilOpen(
    page,
    page.getByRole("button", { name: /^(Version \d|Nothing saved yet)/ }),
    page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Version history" }) }),
  );
}

/** Saves the unsaved changes through the version menu, with a note when given. */
export async function saveConfiguration(page: Page, note?: string) {
  const menu = await openVersionMenu(page);
  const form = menu.getByRole("form", { name: "Save configuration" });
  if (note) await form.getByLabel("Note (optional)").fill(note);
  await form.getByRole("button", { name: "Save", exact: true }).click();
}

/** Opens Version history through the version menu. */
export async function openVersionHistory(page: Page) {
  const menu = await openVersionMenu(page);
  await menu.getByRole("button", { name: "Version history" }).click();
  return page.getByRole("dialog", { name: "Version history" });
}

/** Opens the Templates dialog through the More menu. */
export async function openTemplatesDialog(page: Page) {
  const item = page.getByRole("menuitem", { name: "Templates" });
  // The first click after a navigation can be lost while the page settles: click again.
  await expect(async () => {
    if (!(await item.isVisible())) {
      await page.getByRole("button", { name: "More", exact: true }).click({ timeout: 2_000 });
    }
    await expect(item).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await item.click();
  const dialog = page.getByRole("dialog", { name: "Templates" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The "Chunking" row of the column: a button that says what is chosen, and the strategy and size it opens. */
export class ChunkingRow {
  constructor(private readonly page: Page) {}

  /** The header button: its text is "Chunking" and the current choice. */
  get header() {
    return this.page.getByRole("button", { name: /^Chunking/ });
  }

  get strategy() {
    return this.page.getByRole("combobox", { name: "Strategy" });
  }

  get size() {
    return this.page.getByRole("spinbutton", { name: "Size" });
  }

  /** The words of the closed row after "Chunking". */
  async expectSummary(text: string) {
    await expect(this.header).toHaveAccessibleName(`Chunking ${text}`);
  }

  async open() {
    if ((await this.header.getAttribute("aria-expanded")) !== "true") await this.header.click();
    await expect(this.header).toHaveAttribute("aria-expanded", "true");
    await expect(this.strategy).toBeVisible();
  }

  async choose(label: "Automatic" | "By heading" | "By paragraph" | "Fixed size") {
    await this.open();
    await this.strategy.selectOption({ label });
  }
}
