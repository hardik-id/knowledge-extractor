// @ts-check
// What the live suite needs, in one place: read by the Playwright config, by the
// specs and by `save-login.mjs` (plain JavaScript, so Node runs it without a build).
// Nothing here holds a secret: tokens only ever live in the git-ignored state file.
import { existsSync } from "node:fs";
import path from "node:path";

/** The port of the app in none mode (the real model spec). Same as the fast suite's. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * The port of the app in entra mode. Microsoft only returns to a redirect address
 * registered for the app registration (`http://localhost:<port>/auth/redirect`, as a
 * single-page application), so register this port there. The saved sign-in belongs to
 * this origin: save it and test it on the same port.
 */
export const ENTRA_PORT = Number(process.env.E2E_ENTRA_PORT ?? E2E_PORT + 1);

/** The two ids of the app registration (neither is a secret). */
export const ENTRA_TENANT_ID = process.env.E2E_ENTRA_TENANT_ID ?? "";
export const ENTRA_CLIENT_ID = process.env.E2E_ENTRA_CLIENT_ID ?? "";
export const ENTRA_API_SCOPE = process.env.E2E_ENTRA_API_SCOPE ?? "";

/** The saved sign-in. Holds tokens: git-ignored, never printed, never attached to a report. */
export const STATE_FILE = path.resolve(process.cwd(), "e2e-live/.auth/state.json");

export const ENTRA_ORIGIN = `http://localhost:${ENTRA_PORT}`;

/** The environment of the app in entra mode, against the backend at localhost:8000. */
export function entraAppEnv() {
  return {
    NEXT_DIST_DIR: ".next-e2e-entra",
    NEXT_PUBLIC_BACKEND_MODE: "http",
    NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000/api/v1",
    NEXT_PUBLIC_WS_BASE_URL: "ws://localhost:8000",
    NEXT_PUBLIC_APPS: "studio",
    NEXT_PUBLIC_AUTH_MODE: "entra",
    NEXT_PUBLIC_DEV_ACCESS_TOKEN: "",
    NEXT_PUBLIC_ENTRA_TENANT_ID: ENTRA_TENANT_ID,
    NEXT_PUBLIC_ENTRA_CLIENT_ID: ENTRA_CLIENT_ID,
    ...(ENTRA_API_SCOPE ? { NEXT_PUBLIC_ENTRA_API_SCOPE: ENTRA_API_SCOPE } : {}),
  };
}

/** Why the real model spec cannot run, or null when it can. */
export function modelSkipReason() {
  if (process.env.E2E_LIVE_MODEL !== "1") {
    return "E2E_LIVE_MODEL=1 is not set. This spec needs the backend to run with ASSISTANT_AGENT=openai and a model key (docs/assistant.md in the backend repository).";
  }
  return null;
}

/** Why the real sign-in spec cannot run, or null when it can. */
export function loginSkipReason() {
  if (!existsSync(STATE_FILE)) {
    return "There is no saved sign-in (e2e-live/.auth/state.json). A person saves one with `npm run e2e:save-login`.";
  }
  if (!ENTRA_TENANT_ID || !ENTRA_CLIENT_ID) {
    return "E2E_ENTRA_TENANT_ID and E2E_ENTRA_CLIENT_ID are not set (the ids of the app registration, the ones the saved sign-in was made with).";
  }
  return null;
}
