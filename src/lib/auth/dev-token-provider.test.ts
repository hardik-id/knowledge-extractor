import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiRequest, Next } from "@/lib/api/http-client";
import { authMiddleware } from "@/lib/api/middleware/auth";
import { createDevTokenProvider, DEV_TOKEN_KEY, devTokenAllowed } from "./dev-token-provider";
import { createSessionSignal } from "./session-signal";
import { memoryStorage } from "./test-storage";

const request = (): ApiRequest => ({
  method: "GET",
  url: "https://api.test/workspaces",
  headers: new Headers(),
});

/** An API that accepts exactly one token. */
function api(valid: string) {
  const seen: (string | null)[] = [];
  const next: Next = async (req) => {
    const header = req.headers.get("Authorization");
    seen.push(header);
    return new Response(null, { status: header === `Bearer ${valid}` ? 200 : 401 });
  };
  return { next, seen };
}

describe("createDevTokenProvider", () => {
  test("sends the token the app was built with", async () => {
    const provider = createDevTokenProvider({
      initialToken: "built-in",
      session: createSessionSignal(),
    });
    assert.equal(await provider.getAccessToken(), "built-in");
  });

  test("a pasted token is used at once and kept for the tab", async () => {
    const storage = memoryStorage();
    const provider = createDevTokenProvider({
      initialToken: "built-in",
      storage,
      session: createSessionSignal(),
    });

    provider.setAccessToken("pasted");

    assert.equal(await provider.getAccessToken(), "pasted");
    assert.equal(storage.items.get(DEV_TOKEN_KEY), "pasted");
  });

  test("after a reload the kept token wins over the built-in one, which was refused", async () => {
    const storage = memoryStorage();
    storage.setItem(DEV_TOKEN_KEY, "pasted");
    const reloaded = createDevTokenProvider({
      initialToken: "built-in",
      storage,
      session: createSessionSignal(),
    });
    assert.equal(await reloaded.getAccessToken(), "pasted");
  });

  test("broken storage is the same as no storage", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const provider = createDevTokenProvider({
      initialToken: "built-in",
      storage: broken,
      session: createSessionSignal(),
    });
    assert.equal(await provider.getAccessToken(), "built-in");
    provider.setAccessToken("pasted");
    assert.equal(await provider.getAccessToken(), "pasted");
  });

  test("many refused calls end the session once", async () => {
    const session = createSessionSignal();
    const provider = createDevTokenProvider({ initialToken: "old", session });
    let ends = 0;
    session.subscribe(() => session.isEnded() && ends++);
    let heard = 0;
    provider.subscribe(() => heard++);
    const { next } = api("new");
    const call = authMiddleware(provider);

    const responses = await Promise.all(Array.from({ length: 6 }, () => call(request(), next)));

    assert.deepEqual(
      responses.map((r) => r.status),
      [401, 401, 401, 401, 401, 401],
    );
    assert.equal(session.isEnded(), true);
    assert.equal(ends, 1);
    assert.equal(heard, 1);
  });

  test("once ended it sends no token, so nothing but the 401 comes back", async () => {
    const session = createSessionSignal();
    const provider = createDevTokenProvider({ initialToken: "old", session });
    provider.onUnauthenticated();
    assert.equal(await provider.getAccessToken(), null);
    assert.equal(await provider.refresh(), null);
  });

  test("a new token resumes: calls flow, and the session resumes when told to", async () => {
    const session = createSessionSignal();
    const provider = createDevTokenProvider({ initialToken: "old", session });
    let resumed = 0;
    session.onResume(() => resumed++);
    const { next, seen } = api("new");
    await authMiddleware(provider)(request(), next);
    assert.equal(session.isEnded(), true);

    provider.setAccessToken("new");
    const response = await authMiddleware(provider)(request(), next);

    assert.equal(response.status, 200);
    assert.equal(seen.at(-1), "Bearer new");
    assert.equal(session.isEnded(), true, "still ended until the token is known to be good");
    assert.equal(resumed, 0);

    provider.resume();
    assert.equal(session.isEnded(), false);
    assert.equal(resumed, 1);
  });

  test("a pasted token the API refuses ends the session again, and it can be tried again", async () => {
    const session = createSessionSignal();
    const provider = createDevTokenProvider({ initialToken: "old", session });
    const { next } = api("good");
    await authMiddleware(provider)(request(), next);

    provider.setAccessToken("wrong");
    const refused = await authMiddleware(provider)(request(), next);
    assert.equal(refused.status, 401);
    assert.equal(session.isEnded(), true);
    assert.equal(await provider.getAccessToken(), null, "nothing is sent until another is pasted");

    provider.setAccessToken("good");
    assert.equal((await authMiddleware(provider)(request(), next)).status, 200);
  });
});

describe("devTokenAllowed", () => {
  test("only in mode none, and never in a production build", () => {
    assert.equal(devTokenAllowed("development", "none"), true);
    assert.equal(devTokenAllowed("test", "none"), true);
    assert.equal(devTokenAllowed(undefined, "none"), true);
    assert.equal(devTokenAllowed("production", "none"), false);
    assert.equal(devTokenAllowed("development", "entra"), false);
    assert.equal(devTokenAllowed("development", "fake"), false);
    assert.equal(devTokenAllowed("production", "entra"), false);
  });
});
