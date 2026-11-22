import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { API_BASE_URL, API_ORIGIN } from "../support/env";
import type { Api, ApiProject, Person } from "../fixtures";

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

  async open(project: ApiProject) {
    await this.page.goto(`/studio/projects/${project.id}/extract`);
    await expect(this.page.getByRole("tab", { name: "Define" })).toBeVisible();
  }

  tab(name: "Define" | "Review" | "Output") {
    return this.page.getByRole("tab", { name });
  }

  async openTab(name: "Define" | "Review" | "Output") {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute("aria-selected", "true");
  }

  get assistant() {
    return this.page.getByRole("complementary", { name: "Assistant" });
  }

  get conversation() {
    return this.assistant.getByRole("log", { name: "Conversation" });
  }

  async ask(text: string) {
    await this.assistant.getByLabel("Message to the assistant").fill(text);
    await this.assistant.getByRole("button", { name: "Send" }).click();
  }

  /**
   * Starts a run. The progress arrives live: the tests wait for `finished()`, never reload.
   * It waits for the backend to accept the run (the answer stays true; the "Running" badge
   * is gone as soon as a fast run ends), not for a badge.
   */
  async run(label: "Run extraction" | "Run again") {
    const accepted = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/stages\/extract\/executions$/.test(new URL(response.url()).pathname),
    );
    await this.page.getByRole("button", { name: label }).click();
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
    await expect(this.page.getByRole("button", { name: /^Run (extraction|again)$/ })).toBeEnabled();
  }

  /** A document in the list of the Review (or Output) tab. */
  document(name: string) {
    return this.page.getByRole("button", { name, exact: true });
  }

  /** The record cards of the open document. */
  get records() {
    return this.page.getByRole("article");
  }

  record(heading: string) {
    return this.records.filter({
      has: this.page.getByRole("heading", { level: 4, name: heading }),
    });
  }

  /** The "3 records · 2 accepted · 1 suggested" line above the records. */
  summary() {
    return this.page.getByText(/^\d+ records?/);
  }

  async saveConfiguration(note: string) {
    await this.page.getByRole("button", { name: "Save configuration" }).click();
    const form = this.page.getByRole("form", { name: "Save configuration" });
    await form.getByLabel("Note (optional)").fill(note);
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(this.page.getByTestId("version-line")).not.toHaveText(/Version 1,/);
  }
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
