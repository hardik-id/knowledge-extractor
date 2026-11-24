import { defineConfig, devices } from "@playwright/test";

/**
 * The backend status badge (#257) without a backend. Two apps, one per mode:
 * the mock (the app's default) on E2E_PORT, and the http mode on E2E_PORT + 1, whose API
 * is a made-up host the specs answer themselves with `page.route` (nothing is ever sent).
 * Each uses its own build directory, so a developer's `npm run dev` is not touched.
 * `npm run test:e2e:status`. The main suite (`npm run test:e2e`) needs the real stack.
 */
const MOCK_PORT = Number(process.env.E2E_PORT ?? 3200);
const HTTP_PORT = MOCK_PORT + 1;
export const STUB_API_ORIGIN = "http://api.stub.test";

export default defineConfig({
  testDir: "./e2e-status",
  testMatch: "**/*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-status" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results-status",
  use: { actionTimeout: 10_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "mock",
      testMatch: "**/*.mock.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${MOCK_PORT}` },
    },
    {
      name: "http",
      testMatch: "**/*.http.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${HTTP_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx next dev -p ${MOCK_PORT}`,
      url: `http://localhost:${MOCK_PORT}/studio`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e-status-mock",
        NEXT_PUBLIC_BACKEND_MODE: "mock",
        NEXT_PUBLIC_APPS: "studio,pipeline",
        NEXT_PUBLIC_AUTH_MODE: "none",
      },
    },
    {
      command: `npx next dev -p ${HTTP_PORT}`,
      url: `http://localhost:${HTTP_PORT}/studio`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e-status-http",
        NEXT_PUBLIC_BACKEND_MODE: "http",
        NEXT_PUBLIC_API_BASE_URL: `${STUB_API_ORIGIN}/api/v1`,
        NEXT_PUBLIC_WS_BASE_URL: "ws://api.stub.test",
        NEXT_PUBLIC_APPS: "studio",
        NEXT_PUBLIC_AUTH_MODE: "none",
        NEXT_PUBLIC_DEV_ACCESS_TOKEN: "",
      },
    },
  ],
});
