import { defineConfig, devices } from "@playwright/test";
import { ENTRA_PORT, entraAppEnv, loginSkipReason, modelSkipReason } from "./e2e-live/env.mjs";
import { assertStackUp } from "./e2e/support/stack";
import { API_BASE_URL, BASE_URL, E2E_BASE_URL, E2E_PORT, WS_BASE_URL } from "./e2e/support/env";

/**
 * The live suite (`npm run test:e2e:live`, which sets E2E_LIVE=1): what the fast suite
 * cannot prove, the real model and the real Microsoft sign-in. It is a project of its own,
 * left out unless asked for, so `npm run test:e2e` never runs it and it is never part of
 * the merge path. Specs that lack what they need are skipped with their reason. No trace,
 * screenshot or video: a sign-in context holds tokens.
 */
const LIVE = process.env.E2E_LIVE === "1";

// Only the runner checks, not each of its workers (which load this file again).
if (!process.env.TEST_WORKER_INDEX) assertStackUp();

/**
 * End-to-end tests: Chromium against the app in HTTP mode, over the backend stack
 * (`make up` in the backend repository).
 *
 * The runner starts its own copy of the app on E2E_PORT (default 3100), or tests the
 * one at E2E_BASE_URL and starts nothing. It never touches a developer's own
 * `npm run dev` (usually on port 3000): it uses another port, and its own build
 * directory (NEXT_DIST_DIR, read by next.config.ts), so the two `next dev` processes
 * share neither a port nor `.next`. Parallel runs from different worktrees each use
 * their own E2E_PORT.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: LIVE ? undefined : "./e2e/global-setup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: LIVE
    ? [["list"], ["./e2e-live/skip-reasons-reporter.mjs"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  workers: LIVE ? 1 : undefined,
  // A broken test should fail in seconds with the line it stopped at, not after the 30 s test timeout.
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 10_000,
    baseURL: BASE_URL,
    // Retries happen only in CI; locally there is no retry, so keep the trace of a failure.
    trace: LIVE ? "off" : process.env.CI ? "on-first-retry" : "retain-on-failure",
    screenshot: LIVE ? "off" : "only-on-failure",
  },
  projects: LIVE
    ? [
        {
          name: "live",
          testDir: "./e2e-live",
          testMatch: "**/*.spec.ts",
          // One at a time: a model reply is slow and the sign-in spec ends by signing out.
          fullyParallel: false,
          use: { ...devices["Desktop Chrome"], trace: "off", screenshot: "off", video: "off" },
        },
      ]
    : [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The live suite starts an app only for a spec that will run: the one in none mode for the
  // real model, the one in entra mode for the saved sign-in.
  webServer: LIVE
    ? [
        ...(modelSkipReason() === null && !E2E_BASE_URL ? [appServer()] : []),
        ...(loginSkipReason() === null
          ? [
              {
                command: `npx next dev -p ${ENTRA_PORT}`,
                url: `http://localhost:${ENTRA_PORT}/studio`,
                reuseExistingServer: false,
                timeout: 180_000,
                env: entraAppEnv(),
              },
            ]
          : []),
      ]
    : E2E_BASE_URL
      ? undefined
      : appServer(),
});

function appServer() {
  return {
    command: `npx next dev -p ${E2E_PORT}`,
    url: `${BASE_URL}/studio`,
    // A port in use is somebody else's server (or another run): fail, don't test it.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_BACKEND_MODE: "http",
      NEXT_PUBLIC_API_BASE_URL: API_BASE_URL,
      NEXT_PUBLIC_WS_BASE_URL: WS_BASE_URL,
      NEXT_PUBLIC_APPS: "studio",
      NEXT_PUBLIC_AUTH_MODE: "none",
      // The fixtures put each test person's token on the requests, so the app has none.
      NEXT_PUBLIC_DEV_ACCESS_TOKEN: "",
    },
  };
}
