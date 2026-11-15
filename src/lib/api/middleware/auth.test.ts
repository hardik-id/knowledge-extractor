import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiRequest, Next } from "../http-client";
import type { TokenProvider } from "../token-provider";
import { authMiddleware } from "./auth";

const request = (): ApiRequest => ({
  method: "GET",
  url: "https://api.test/runs/1",
  headers: new Headers(),
});

/** A server that accepts exactly one token. Records the Authorization header of every call. */
function server(validToken: string) {
  const seen: (string | null)[] = [];
  const next: Next = async (req) => {
    const header = req.headers.get("Authorization");
    seen.push(header);
    return new Response(null, { status: header === `Bearer ${validToken}` ? 200 : 401 });
  };
  return { next, seen };
}

function tokens(initial: string | null, refreshTo: string | null) {
  const calls = { refresh: 0, unauthenticated: 0 };
  let token = initial;
  const provider: TokenProvider = {
    getAccessToken: () => token,
    refresh: async () => {
      calls.refresh++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      token = refreshTo;
      return token;
    },
    onUnauthenticated: () => {
      calls.unauthenticated++;
    },
  };
  return { provider, calls };
}

describe("authMiddleware", () => {
  test("sends the access token as a bearer token", async () => {
    const { next, seen } = server("good");
    const { provider, calls } = tokens("good", null);

    const response = await authMiddleware(provider)(request(), next);

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["Bearer good"]);
    assert.equal(calls.refresh, 0);
  });

  test("on 401 it refreshes once and sends the request again", async () => {
    const { next, seen } = server("new");
    const { provider, calls } = tokens("old", "new");

    const response = await authMiddleware(provider)(request(), next);

    assert.equal(response.status, 200);
    assert.deepEqual(seen, ["Bearer old", "Bearer new"]);
    assert.equal(calls.refresh, 1);
    assert.equal(calls.unauthenticated, 0);
  });

  test("calls that fail together share one refresh", async () => {
    const { next, seen } = server("new");
    const { provider, calls } = tokens("old", "new");
    const middleware = authMiddleware(provider);

    const responses = await Promise.all([
      middleware(request(), next),
      middleware(request(), next),
      middleware(request(), next),
    ]);

    assert.deepEqual(
      responses.map((r) => r.status),
      [200, 200, 200],
    );
    assert.equal(calls.refresh, 1);
    assert.equal(seen.filter((header) => header === "Bearer new").length, 3);
  });

  test("when the session can't be renewed it reports that and returns the 401", async () => {
    const { next } = server("new");
    const { provider, calls } = tokens("old", null);

    const response = await authMiddleware(provider)(request(), next);

    assert.equal(response.status, 401);
    assert.equal(calls.refresh, 1);
    assert.equal(calls.unauthenticated, 1);
  });

  test("a refreshed token that is still refused is not tried a third time", async () => {
    const { next, seen } = server("something-else");
    const { provider, calls } = tokens("old", "new");

    const response = await authMiddleware(provider)(request(), next);

    assert.equal(response.status, 401);
    assert.equal(seen.length, 2);
    assert.equal(calls.unauthenticated, 1);
  });
});
