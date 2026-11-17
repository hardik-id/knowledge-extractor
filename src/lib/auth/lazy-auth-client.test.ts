import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthClient } from "./auth-client";
import { lazyAuthClient } from "./lazy-auth-client";

function inner() {
  const log: string[] = [];
  const listeners: (() => void)[] = [];
  let unsubscribed = 0;
  const client: AuthClient = {
    init: async () => (log.push("init"), { status: "signed-out" }),
    signIn: async () => void log.push("signIn"),
    signInAgain: async () => (log.push("signInAgain"), { id: "a", name: "A", username: "a" }),
    signOut: async () => void log.push("signOut"),
    getAccessToken: async (o) => (log.push(`token ${o?.forceRefresh ?? false}`), "t"),
    onSignedOutElsewhere: (l) => {
      listeners.push(l);
      return () => {
        unsubscribed++;
      };
    },
  };
  return { client, log, listeners, unsubscribed: () => unsubscribed };
}

describe("lazyAuthClient", () => {
  test("does not load until used, loads once, and forwards", async () => {
    const { client, log } = inner();
    let loads = 0;
    const lazy = lazyAuthClient(async () => (loads++, client));
    assert.equal(loads, 0);

    await lazy.init();
    await lazy.signIn();
    await lazy.signInAgain();
    await lazy.signOut();
    assert.equal(await lazy.getAccessToken({ forceRefresh: true }), "t");

    assert.equal(loads, 1);
    assert.deepEqual(log, ["init", "signIn", "signInAgain", "signOut", "token true"]);
  });

  test("onSignedOutElsewhere returns at once and forwards once loaded", async () => {
    const { client, listeners, unsubscribed } = inner();
    const lazy = lazyAuthClient(async () => client);
    let heard = 0;
    const stop = lazy.onSignedOutElsewhere(() => heard++);
    await new Promise((resolve) => setTimeout(resolve, 5));
    listeners[0]();
    assert.equal(heard, 1);
    stop();
    assert.equal(unsubscribed(), 1);
  });

  test("unsubscribing before the load finishes never subscribes", async () => {
    const { client, listeners } = inner();
    const lazy = lazyAuthClient(async () => client);
    lazy.onSignedOutElsewhere(() => {})();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(listeners.length, 0);
  });

  test("a failed load rejects the methods", async () => {
    const lazy = lazyAuthClient(async () => {
      throw new Error("chunk failed");
    });
    await assert.rejects(lazy.init(), /chunk failed/);
    lazy.onSignedOutElsewhere(() => {})();
  });
});
