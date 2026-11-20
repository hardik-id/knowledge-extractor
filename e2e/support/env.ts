import { existsSync } from "node:fs";
import path from "node:path";

/** The backend's address: fixed, the one `make up` in the backend repository serves. */
export const API_ORIGIN = "http://localhost:8000";
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
export const WS_BASE_URL = "ws://localhost:8000";

/** The port the runner starts the app on. Give each parallel run, in each worktree, its own. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);

/** Set to test an app that is already running; the runner then starts nothing. */
export const E2E_BASE_URL = process.env.E2E_BASE_URL || null;

/** Where the runner opens the app. */
export const BASE_URL = E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

const API_DIR_NAME = "knowledge-extractor-api";

/**
 * The backend repository: `API_DIR`, or the sibling `../knowledge-extractor-api`.
 * From a git worktree inside this repository (`.worktrees/<name>`), the sibling is
 * a few folders further up, so each parent folder is tried in turn.
 */
export function apiDir(): string {
  if (process.env.API_DIR) return path.resolve(process.env.API_DIR);
  let folder = process.cwd();
  for (let i = 0; i < 4; i++) {
    folder = path.dirname(folder);
    const candidate = path.join(folder, API_DIR_NAME);
    if (existsSync(path.join(candidate, "compose.yaml"))) return candidate;
  }
  return path.resolve(process.cwd(), "..", API_DIR_NAME);
}
