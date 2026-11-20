import { spawnSync } from "node:child_process";
import { API_BASE_URL, apiDir } from "./env";

/**
 * Fails at once, with one clear line, when the backend stack is not up.
 *
 * It is synchronous because the config calls it while loading: that is before the
 * runner starts the app (a global setup would run after it), so a missing backend
 * costs a second, not a build and a timeout.
 */
export function assertStackUp(): void {
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `fetch(process.argv[1], { signal: AbortSignal.timeout(5000) })
         .then((r) => { if (!r.ok) throw new Error("answered " + r.status); })
         .catch((e) => { console.log(e.cause?.code ?? e.message); process.exit(1); });`,
      `${API_BASE_URL}/ready`,
    ],
    { encoding: "utf8" },
  );
  if (probe.status === 0) return;
  throw new Error(
    `The backend is not ready at ${API_BASE_URL}/ready (${probe.stdout.trim() || "no answer"}). ` +
      `Start the stack with "make up" in the backend repository (${apiDir()}).`,
  );
}
