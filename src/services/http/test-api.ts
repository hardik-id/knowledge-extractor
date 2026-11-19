/**
 * `npm run test:api`: walks the Knowledge Studio flow against a running
 * backend, through the real HTTP services and parsers. Not part of `npm test`.
 *
 *   API_BASE_URL      the API, e.g. http://localhost:8000/api/v1 (the default)
 *   DEV_ACCESS_TOKEN  a bearer token for it (required)
 *   WS_BASE_URL       optional; default: the API's host over ws:// or wss://
 *
 * Prints one line per step. Exits with 1 at the first step that fails, with
 * the server's answer.
 */
import { createApiClient, createMemoryTokenProvider } from "@/lib/api";
import { createHttpServices } from "./index";
import { runStudioFlow, StudioFlowError } from "./studio-flow";

function settings() {
  const apiBaseUrl = (process.env.API_BASE_URL?.trim() || "http://localhost:8000/api/v1").replace(
    /\/+$/,
    "",
  );
  const token = process.env.DEV_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "DEV_ACCESS_TOKEN is not set. Mint one in the backend repository (make token) and run again.",
    );
  }
  let origin: string;
  try {
    origin = new URL(apiBaseUrl).origin;
  } catch {
    throw new Error(`API_BASE_URL must be a full URL, got "${apiBaseUrl}".`);
  }
  const wsBaseUrl = (process.env.WS_BASE_URL?.trim() || origin.replace(/^http/, "ws")).replace(
    /\/+$/,
    "",
  );
  return { apiBaseUrl, wsBaseUrl, token };
}

async function main(): Promise<number> {
  let config: ReturnType<typeof settings>;
  try {
    config = settings();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const services = createHttpServices({
    client: createApiClient({
      baseUrl: config.apiBaseUrl,
      tokens: createMemoryTokenProvider({ initialToken: config.token }),
    }),
    wsBaseUrl: config.wsBaseUrl,
  });

  console.log(`Knowledge Studio flow against ${config.apiBaseUrl} (socket ${config.wsBaseUrl})\n`);
  try {
    await runStudioFlow(services, { log: (line) => console.log(line) });
  } catch (error) {
    const message = error instanceof StudioFlowError ? error.message : String(error);
    console.error(`\nFailed at ${message.replace(/\n/g, "\n  ")}`);
    return 1;
  }
  console.log("\nEvery step passed.");
  return 0;
}

process.exit(await main());
