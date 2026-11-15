/**
 * Public settings, read once and checked. Set them in `.env.local`
 * (see `.env.example`). They are fixed at build time: Next.js inlines
 * `NEXT_PUBLIC_*` values into the browser bundle.
 */

export type BackendMode = "mock" | "http";

export interface Env {
  /** `mock`: everything runs in the browser. `http`: the Django API and its WebSocket. */
  backendMode: BackendMode;
  /** e.g. "https://api.example.com/api/v1". Empty in mock mode. */
  apiBaseUrl: string;
  /** e.g. "wss://api.example.com". Empty in mock mode. */
  wsBaseUrl: string;
  /** Local development only: a token to use until sign-in is connected. */
  devAccessToken: string | null;
}

export interface RawEnv {
  backendMode?: string;
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  devAccessToken?: string;
  nodeEnv?: string;
}

function requireUrl(name: string, value: string, protocols: string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a full URL, got "${value}".`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must start with ${protocols.map((p) => `${p}//`).join(" or ")}.`);
  }
  return value.replace(/\/+$/, "");
}

export function parseEnv(raw: RawEnv): Env {
  const backendMode = raw.backendMode?.trim() || "mock";
  if (backendMode !== "mock" && backendMode !== "http") {
    throw new Error(`NEXT_PUBLIC_BACKEND_MODE must be "mock" or "http", got "${backendMode}".`);
  }
  if (backendMode === "mock") {
    return { backendMode, apiBaseUrl: "", wsBaseUrl: "", devAccessToken: null };
  }

  const api = raw.apiBaseUrl?.trim();
  if (!api)
    throw new Error('NEXT_PUBLIC_API_BASE_URL is required when the backend mode is "http".');
  const apiBaseUrl = requireUrl("NEXT_PUBLIC_API_BASE_URL", api, ["http:", "https:"]);

  // Default: the same host as the API, over ws(s).
  const ws = raw.wsBaseUrl?.trim() || new URL(apiBaseUrl).origin.replace(/^http/, "ws");
  const wsBaseUrl = requireUrl("NEXT_PUBLIC_WS_BASE_URL", ws, ["ws:", "wss:"]);

  const devAccessToken =
    raw.nodeEnv !== "production" && raw.devAccessToken?.trim() ? raw.devAccessToken.trim() : null;

  return { backendMode, apiBaseUrl, wsBaseUrl, devAccessToken };
}

// Each variable is named in full: Next.js only inlines literal `process.env.NEXT_PUBLIC_*` reads.
export const env: Env = parseEnv({
  backendMode: process.env.NEXT_PUBLIC_BACKEND_MODE,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  wsBaseUrl: process.env.NEXT_PUBLIC_WS_BASE_URL,
  devAccessToken: process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN,
  nodeEnv: process.env.NODE_ENV,
});
