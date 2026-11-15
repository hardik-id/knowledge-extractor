/**
 * Lets Node's test runner load the app's TypeScript the way the bundler does:
 * the `@/` alias points at `src/`, and imports may leave out `.ts` or `/index.ts`.
 * Loaded with `node --import ./test/register.mjs --test` (see `npm test`).
 */
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(import.meta.dirname, "../src");
const SRC_URL = pathToFileURL(SRC).href + "/";

const isFile = (file) => existsSync(file) && statSync(file).isFile();

function findSource(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(isFile);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only the app's own files import this way. Packages resolve as usual.
    if (!context.parentURL?.startsWith(SRC_URL)) return nextResolve(specifier, context);

    let base;
    if (specifier.startsWith("@/")) {
      base = path.join(SRC, specifier.slice(2));
    } else if (/^\.{1,2}\//.test(specifier)) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    const file = base && findSource(base);
    return nextResolve(file ? pathToFileURL(file).href : specifier, context);
  },
});
