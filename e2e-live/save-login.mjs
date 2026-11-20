// @ts-check
// `npm run e2e:save-login`: a person signs in once, in a headed browser, and the
// signed-in state is saved for the live sign-in spec. Microsoft's own page is never
// scripted (multi-factor, bot checks): this only waits for the person.
//
// The file holds tokens. It goes to the git-ignored e2e-live/.auth/, readable by
// the owner only. Nothing here prints it, and no token is put in a message.
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  ENTRA_CLIENT_ID,
  ENTRA_ORIGIN,
  ENTRA_PORT,
  ENTRA_TENANT_ID,
  STATE_FILE,
  entraAppEnv,
} from "./env.mjs";

if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID) {
  console.error(
    "Set E2E_ENTRA_TENANT_ID and E2E_ENTRA_CLIENT_ID (the ids of the app registration), and register " +
      `${ENTRA_ORIGIN}/auth/redirect as a single-page application redirect address. See CLAUDE.md, "End-to-end tests".`,
  );
  process.exit(1);
}

const server = spawn("npx", ["next", "dev", "-p", String(ENTRA_PORT)], {
  env: { ...process.env, ...entraAppEnv() },
  stdio: "ignore",
});
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

async function waitForApp() {
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(`${ENTRA_ORIGIN}/studio`)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The app did not start on ${ENTRA_ORIGIN}.`);
}

const browser = await chromium.launch({ headless: false });
try {
  await waitForApp();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ENTRA_ORIGIN}/studio`);
  await page.getByRole("button", { name: "Sign in with Microsoft" }).click();
  console.log("Sign in in the browser window. This waits up to 5 minutes.");
  // Signed in: back on the app, with the account menu showing.
  await page
    .getByRole("heading", { name: "Projects", level: 1 })
    .waitFor({ state: "visible", timeout: 5 * 60_000 });

  // MSAL keeps its cache in sessionStorage, which a storage state does not include.
  const sessionStorage = await page.evaluate(() =>
    Object.fromEntries(Object.entries(window.sessionStorage)),
  );
  const storageState = await context.storageState();
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ origin: ENTRA_ORIGIN, storageState, sessionStorage }),
    { mode: 0o600 },
  );
  chmodSync(STATE_FILE, 0o600);
  console.log(
    "Saved the sign-in to e2e-live/.auth/state.json (git-ignored, holds tokens: keep it private).",
  );
} finally {
  await browser.close();
  stop();
}
