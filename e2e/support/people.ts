import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { apiDir } from "./env";

/** A test person: the backend knows them by the `oid` in their token and keeps their data apart. */
export interface Person {
  oid: string;
  token: string;
}

/**
 * The one place that gets a token. It asks the running backend to mint a dev token
 * for the person. If the way to get a token changes, change only this function.
 */
export function mintToken(oid: string): string {
  const cwd = apiDir();
  try {
    return execFileSync(
      "docker",
      ["compose", "exec", "-T", "api", "python", "manage.py", "mint_dev_token", "--oid", oid],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (failure) {
    const detail = failure instanceof Error ? failure.message.split("\n")[0] : String(failure);
    throw new Error(
      `Could not mint a dev token with "docker compose exec api" in ${cwd} (${detail}). ` +
        `Is the stack up ("make up" there)? Set API_DIR if the backend repository is somewhere else.`,
    );
  }
}

/** A person nobody has used before. */
export function newPerson(): Person {
  const oid = randomUUID();
  return { oid, token: mintToken(oid) };
}
