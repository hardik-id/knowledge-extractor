import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthClient } from "./auth-client";
import { createAuthTokenProvider } from "./auth-token-provider";

function client(token: string | null = "tok") {
  const calls: ({ forceRefresh?: boolean } | undefined)[] = [];
  const stub = {
    getAccessToken: async (options?: { forceRefresh?: boolean }) => {
      calls.push(options);
      return token;
    },
  } as unknown as AuthClient;
  return { stub, calls };
}

describe("createAuthTokenProvider", () => {
  test("gets and refreshes through the client", async () => {
    const { stub, calls } = client();
    const provider = createAuthTokenProvider(stub);
    assert.equal(await provider.getAccessToken(), "tok");
    assert.equal(await provider.refresh(), "tok");
    assert.deepEqual(calls, [undefined, { forceRefresh: true }]);
  });

  test("errors from the client propagate", async () => {
    const boom = new Error("offline");
    const provider = createAuthTokenProvider({
      getAccessToken: async () => {
        throw boom;
      },
    } as unknown as AuthClient);
    await assert.rejects(
      async () => provider.getAccessToken(),
      (e: unknown) => e === boom,
    );
    await assert.rejects(provider.refresh(), (e: unknown) => e === boom);
  });

  test("an ended session notifies once and hands out nothing without asking the client", async () => {
    const { stub, calls } = client();
    const provider = createAuthTokenProvider(stub);
    let notified = 0;
    provider.subscribe(() => notified++);

    provider.onUnauthenticated();
    provider.onUnauthenticated();

    assert.equal(notified, 1);
    assert.equal(await provider.getAccessToken(), null);
    assert.equal(await provider.refresh(), null);
    assert.equal(calls.length, 0);
  });

  test("resume brings tokens back and lets the next end be reported", async () => {
    const { stub } = client();
    const provider = createAuthTokenProvider(stub);
    let notified = 0;
    const stop = provider.subscribe(() => notified++);

    provider.onUnauthenticated();
    provider.resume();
    assert.equal(await provider.getAccessToken(), "tok");
    provider.onUnauthenticated();
    assert.equal(notified, 2);

    stop();
    provider.resume();
    provider.onUnauthenticated();
    assert.equal(notified, 2);
  });
});
