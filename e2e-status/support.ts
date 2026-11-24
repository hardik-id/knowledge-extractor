import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { clickUntilOpen } from "../e2e/support/first-click";
import { STUB_API_ORIGIN } from "../playwright.status.config";

export const SHOTS = process.env.STATUS_SHOTS ?? "";

/** The contract's body, with the parts a test changes. */
export interface Part {
  id: string;
  mode: "stub" | "real";
  label: string;
  state: "stub" | "ok" | "failing" | "unknown";
  checked_at: string | null;
  problem: string | null;
}

export const stubPart = (id: string, label: string): Part => ({
  id,
  mode: "stub",
  label,
  state: "stub",
  checked_at: null,
  problem: null,
});
export const realPart = (id: string, label: string, over: Partial<Part> = {}): Part => ({
  id,
  mode: "real",
  label,
  state: "ok",
  checked_at: new Date(Date.now() - 120_000).toISOString(),
  problem: null,
  ...over,
});

export const ALL_STUB: Part[] = [
  stubPart("assistant", "Scripted"),
  stubPart("extraction", "Scripted"),
  stubPart("storage", "Samples"),
  stubPart("sign_in", "Dev token"),
  realPart("live_updates", "Redis"),
  realPart("worker", "Background worker"),
];
export const ALL_REAL: Part[] = [
  realPart("assistant", "azure · gpt-test"),
  realPart("extraction", "azure · gpt-test"),
  realPart("storage", "Azure Blob"),
  realPart("sign_in", "Microsoft Entra"),
  realPart("live_updates", "Redis"),
  realPart("worker", "Background worker"),
];
export const ONE_FAILING: Part[] = ALL_REAL.map((p) =>
  p.id === "worker" ? { ...p, state: "failing", problem: "worker_stalled" } : p,
);

export interface Stub {
  /** Every request the app made to the status endpoints, in order. */
  calls: string[];
}

export interface StubOptions {
  /** Answer for GET /status: parts, or 404 for a backend that has no such endpoint. */
  status: Part[] | 404;
  /** Answer for POST /status/test; `cached` adds the header. */
  test?: { parts: Part[]; cached?: boolean; delayMs?: number };
}

/** Answers the app's calls in http mode. Nothing leaves the browser. */
export async function stubApi(context: BrowserContext, options: StubOptions): Promise<Stub> {
  const stub: Stub = { calls: [] };
  await context.route(`${STUB_API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    if (path === "/status" && request.method() === "GET") {
      stub.calls.push("GET /status");
      if (options.status === 404) {
        return route.fulfill({ status: 404, json: { code: "not_found", message: "Not found." } });
      }
      return route.fulfill({ json: { environment: "local", parts: options.status } });
    }
    if (path === "/status/test" && request.method() === "POST") {
      stub.calls.push("POST /status/test");
      const test = options.test ?? { parts: ALL_REAL };
      if (test.delayMs) await new Promise((resolve) => setTimeout(resolve, test.delayMs));
      return route.fulfill({
        json: { environment: "local", parts: test.parts },
        // The page and the API are different origins: the browser only lets the page read this
        // header when the API exposes it (the backend must list it in its CORS settings).
        headers: test.cached
          ? { "X-Status-Test": "cached", "Access-Control-Expose-Headers": "X-Status-Test" }
          : { "Access-Control-Expose-Headers": "X-Status-Test" },
      });
    }
    if (path === "/projects") return route.fulfill({ json: { items: [], next: null } });
    return route.fulfill({ status: 404, json: { code: "not_found", message: "Not found." } });
  });
  return stub;
}

export const badge = (page: Page) => page.getByRole("button", { name: /^Backend status: / });
export const panel = (page: Page) => page.getByRole("dialog", { name: "Backend status" });

/**
 * `test` with Next's development indicator hidden: it sits over the bottom left corner, where
 * the sidebar's badge is, and takes the clicks.
 */
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal { display: none !important; }";
        document.head.append(style);
      });
    });
    await run(page);
  },
});

/** Mock mode: a new project with the first document picked, left on the working screen. */
export async function openMockWorkspace(page: Page) {
  await page.goto("/studio");
  const dialog = page.getByRole("dialog", { name: "New project" });
  await clickUntilOpen(page, page.getByRole("button", { name: "New project" }), dialog);
  await dialog.getByRole("textbox").first().fill("Status check");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: /^Use .*documents?$/ }).click();
  await expect(page.getByTestId("version-line")).toBeVisible();
}
