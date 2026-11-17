import { env } from "@/config/env";
import { createApiClient } from "@/lib/api";
import { authTokens } from "./auth";
import type { Services } from "./contracts";
import { createHttpServices } from "./http";
import { createMockServices } from "./mock";
import { MockBackend } from "./mock/mock-backend";

/**
 * The boundary to the backend. Everything else imports `services` from here
 * and never knows whether it talks to the mock or to Django:
 * set NEXT_PUBLIC_BACKEND_MODE to switch.
 */

export { authClient, authSession, authTokens } from "./auth";

const mockBackend = env.backendMode === "http" ? null : new MockBackend();

export const services: Services =
  env.backendMode === "http"
    ? createHttpServices({
        client: createApiClient({ baseUrl: env.apiBaseUrl, tokens: authTokens }),
        wsBaseUrl: env.wsBaseUrl,
      })
    : createMockServices(mockBackend ?? undefined);

/** Removes what the previous person left in this browser (the mock's runs). The real backend keeps its own data. */
export function clearLocalData(): void {
  mockBackend?.reset();
}
