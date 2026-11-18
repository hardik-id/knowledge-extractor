/**
 * Public settings, read once and checked. Set them in `.env.local`
 * (see `.env.example`). They are fixed at build time: Next.js inlines
 * `NEXT_PUBLIC_*` values into the browser bundle.
 */

import { APP_IDS, type AppId } from "../apps/app-ids";

export type BackendMode = "mock" | "http";

/** `none`: no sign-in. `entra`: Microsoft Entra ID. `fake`: a pretend account, for local checks. */
export type AuthMode = "none" | "entra" | "fake";

export interface EntraSettings {
  tenantId: string;
  clientId: string;
  /** The scope the access token is asked for. Default: api://<clientId>/access_as_user */
  apiScope: string;
}

export interface Env {
  /** `mock`: everything runs in the browser. `http`: the Django API and its WebSocket. */
  backendMode: BackendMode;
  /** e.g. "https://api.example.com/api/v1". Empty in mock mode. */
  apiBaseUrl: string;
  /** e.g. "wss://api.example.com". Empty in mock mode. */
  wsBaseUrl: string;
  /** Local development only: a token to use when the auth mode is `none`. */
  devAccessToken: string | null;
  authMode: AuthMode;
  /** The apps the shell offers, in order. Every app when the setting is left out. */
  apps: AppId[];
  /** Set only when the auth mode is `entra`. */
  entra: EntraSettings | null;
}

export interface RawEnv {
  backendMode?: string;
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  devAccessToken?: string;
  authMode?: string;
  apps?: string;
  entraTenantId?: string;
  entraClientId?: string;
  entraApiScope?: string;
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

function parseApps(value: string | undefined): AppId[] {
  if (value === undefined || value.trim() === "") {
    // An empty value is left-out only for an unset variable; a set-but-blank one is an empty list.
    if (value === undefined) return [...APP_IDS];
    throw new Error(`NEXT_PUBLIC_APPS is empty: list at least one of ${APP_IDS.join(", ")}.`);
  }
  const apps: AppId[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (!(APP_IDS as readonly string[]).includes(id)) {
      throw new Error(
        `NEXT_PUBLIC_APPS has an unknown app "${id}": use ${APP_IDS.join(", ")}, comma-separated.`,
      );
    }
    if (!apps.includes(id as AppId)) apps.push(id as AppId);
  }
  return apps;
}

export function parseEnv(raw: RawEnv): Env {
  const apps = parseApps(raw.apps);
  const backendMode = raw.backendMode?.trim() || "mock";
  if (backendMode !== "mock" && backendMode !== "http") {
    throw new Error(`NEXT_PUBLIC_BACKEND_MODE must be "mock" or "http", got "${backendMode}".`);
  }

  // Sign-in is checked before the mock shortcut: it works with the mock backend too.
  const authMode = raw.authMode?.trim() || "none";
  if (authMode !== "none" && authMode !== "entra" && authMode !== "fake") {
    throw new Error(`NEXT_PUBLIC_AUTH_MODE must be "none", "entra" or "fake", got "${authMode}".`);
  }
  if (authMode === "fake" && raw.nodeEnv === "production") {
    throw new Error('NEXT_PUBLIC_AUTH_MODE "fake" is for local checks only, not for production.');
  }
  let entra: EntraSettings | null = null;
  if (authMode === "entra") {
    const tenantId = raw.entraTenantId?.trim();
    if (!tenantId) {
      throw new Error('NEXT_PUBLIC_ENTRA_TENANT_ID is required when the auth mode is "entra".');
    }
    const clientId = raw.entraClientId?.trim();
    if (!clientId) {
      throw new Error('NEXT_PUBLIC_ENTRA_CLIENT_ID is required when the auth mode is "entra".');
    }
    const apiScope = raw.entraApiScope?.trim() || `api://${clientId}/access_as_user`;
    entra = { tenantId, clientId, apiScope };
  }

  if (backendMode === "mock") {
    return {
      backendMode,
      apiBaseUrl: "",
      wsBaseUrl: "",
      devAccessToken: null,
      authMode,
      apps,
      entra,
    };
  }
  if (raw.nodeEnv === "production" && authMode !== "entra") {
    throw new Error(
      'A production build against the real API needs sign-in: set NEXT_PUBLIC_AUTH_MODE to "entra".',
    );
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

  return { backendMode, apiBaseUrl, wsBaseUrl, devAccessToken, authMode, apps, entra };
}

// Each variable is named in full: Next.js only inlines literal `process.env.NEXT_PUBLIC_*` reads.
export const env: Env = parseEnv({
  backendMode: process.env.NEXT_PUBLIC_BACKEND_MODE,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  wsBaseUrl: process.env.NEXT_PUBLIC_WS_BASE_URL,
  devAccessToken: process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN,
  authMode: process.env.NEXT_PUBLIC_AUTH_MODE,
  apps: process.env.NEXT_PUBLIC_APPS,
  entraTenantId: process.env.NEXT_PUBLIC_ENTRA_TENANT_ID,
  entraClientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID,
  entraApiScope: process.env.NEXT_PUBLIC_ENTRA_API_SCOPE,
  nodeEnv: process.env.NODE_ENV,
});
