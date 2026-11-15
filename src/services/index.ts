import { env } from "@/config/env";
import { createApiClient, createMemoryTokenProvider } from "@/lib/api";
import type { Services } from "./contracts";
import { createHttpServices } from "./http";
import { createMockServices } from "./mock";

/**
 * The boundary to the backend. Everything else imports `services` from here
 * and never knows whether it talks to the mock or to Django:
 * set NEXT_PUBLIC_BACKEND_MODE to switch.
 */

/**
 * The access token for the Django API. Sign-in is not connected yet: when it
 * is, call `authTokens.setAccessToken()` after login and pass `refresh` and
 * `onUnauthenticated` here.
 */
export const authTokens = createMemoryTokenProvider({ initialToken: env.devAccessToken });

export const services: Services =
  env.backendMode === "http"
    ? createHttpServices({
        client: createApiClient({ baseUrl: env.apiBaseUrl, tokens: authTokens }),
        wsBaseUrl: env.wsBaseUrl,
      })
    : createMockServices();
