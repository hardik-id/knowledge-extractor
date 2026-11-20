import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
} from "@playwright/test";
import { API_BASE_URL, API_ORIGIN } from "./support/env";
import { newPerson, type Person } from "./support/people";

export { expect, newPerson };
export type { Person };

/** An API answer a test expects to be an error (for example a 404 on a deleted project). */
export interface ExpectedApiError {
  status: number;
  method?: string;
  /** A part of the path (after /api/v1), or a pattern for it. */
  path?: string | RegExp;
}

/** A project, as the API answers it (the fields the tests use). */
export interface ApiProject {
  id: string;
  name: string;
  description: string;
  run_id: string;
}

/** Sets up data as the test's person, without clicking. */
export interface Api {
  createProject(input: { name: string; description?: string }): Promise<ApiProject>;
  listProjects(): Promise<ApiProject[]>;
}

function createApi(request: APIRequestContext): Api {
  const read = async <T>(response: APIResponse): Promise<T> => {
    if (!response.ok()) {
      throw new Error(`${response.url()} answered ${response.status()}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  };
  return {
    async createProject({ name, description = "" }) {
      return read<ApiProject>(await request.post("projects", { data: { name, description } }));
    },
    async listProjects() {
      return (await read<{ items: ApiProject[] }>(await request.get("projects"))).items;
    },
  };
}

interface Fixtures {
  /** The person this test acts as: new for every test, so tests share no data. */
  person: Person;
  /** Sets up data through the API as `person`. */
  api: Api;
  /** Declares an API answer of 4xx or 5xx that this test expects. Any other one fails the test. */
  expectApiError: (expected: ExpectedApiError) => void;
  /** A browser context signed in as another, new person (closed after the test). */
  contextFor: (person: Person) => Promise<BrowserContext>;
}

interface Watch {
  problems: string[];
  /** Console "Failed to load resource" errors, kept apart: an expected API error causes one. */
  loadFailures: { url: string; text: string }[];
  /** The API answers this test declared with `expectApiError`. */
  expected: ExpectedApiError[];
  /** URLs of the answers that matched one of them. */
  expectedUrls: Set<string>;
}

/**
 * Signs a context in as `person`: the token goes on every request to the API.
 * This is the only place the browser gets its token (the app itself is built without one).
 */
async function signIn(context: BrowserContext, person: Person) {
  await context.route(`${API_ORIGIN}/**`, (route) =>
    route.continue({
      headers: { ...route.request().headers(), authorization: `Bearer ${person.token}` },
    }),
  );
}

function isExpected(watched: Watch, method: string, url: string, status: number) {
  const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
  return watched.expected.some(
    (e) =>
      e.status === status &&
      (e.method === undefined || e.method.toUpperCase() === method) &&
      (e.path === undefined ||
        (typeof e.path === "string" ? path.includes(e.path) : e.path.test(path))),
  );
}

/** Collects what fails a test: console errors, uncaught exceptions, unexpected API 4xx and 5xx. */
function watchPages(context: BrowserContext, watched: Watch) {
  context.on("page", (page) => {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (message.text().startsWith("Failed to load resource")) {
        watched.loadFailures.push({ url: message.location().url, text: message.text() });
      } else {
        watched.problems.push(`console error: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => watched.problems.push(`uncaught exception: ${error.message}`));
    page.on("response", (response) => {
      if (!response.url().startsWith(API_ORIGIN) || response.status() < 400) return;
      const method = response.request().method();
      if (isExpected(watched, method, response.url(), response.status())) {
        watched.expectedUrls.add(response.url());
      } else {
        watched.problems.push(
          `unexpected API answer: ${method} ${response.url()} ${response.status()}`,
        );
      }
    });
  });
}

export const test = base.extend<Fixtures & { watched: Watch }>({
  person: async ({}, run) => {
    await run(newPerson());
  },

  api: async ({ playwright, person }, run) => {
    const request = await playwright.request.newContext({
      // The trailing slash makes "projects" resolve under /api/v1.
      baseURL: `${API_BASE_URL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${person.token}` },
    });
    await run(createApi(request));
    await request.dispose();
  },

  // What the pages reported. After the test, anything unexpected fails it.
  watched: async ({}, run) => {
    const watched: Watch = {
      problems: [],
      loadFailures: [],
      expected: [],
      expectedUrls: new Set(),
    };
    await run(watched);
    // A 4xx or 5xx the test declared shows up in the console too: that one is expected.
    const unexplained = watched.loadFailures
      .filter((failure) => !watched.expectedUrls.has(failure.url))
      .map((failure) => `console error: ${failure.text} (${failure.url})`);
    expect([...watched.problems, ...unexplained], "the browser reported errors").toEqual([]);
  },

  expectApiError: async ({ watched }, run) => {
    await run((expected) => watched.expected.push(expected));
  },

  context: async ({ context, person, watched }, run) => {
    await signIn(context, person);
    watchPages(context, watched);
    await run(context);
  },

  contextFor: async ({ browser, baseURL, watched }, run) => {
    const opened: BrowserContext[] = [];
    await run(async (other) => {
      const context = await browser.newContext({ baseURL });
      opened.push(context);
      await signIn(context, other);
      watchPages(context, watched);
      return context;
    });
    await Promise.all(opened.map((context) => context.close()));
  },
});
