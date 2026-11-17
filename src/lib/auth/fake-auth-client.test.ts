import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { memoryStorage } from "./test-storage";
import { createFakeAuthClient } from "./fake-auth-client";

function setup() {
  const storage = memoryStorage();
  const moves: string[] = [];
  const client = createFakeAuthClient({ storage, navigate: (to) => void moves.push(to) });
  return { storage, moves, client };
}

describe("fake auth client", () => {
  test("is signed out until signIn, which stores Ada and reloads", async () => {
    const { storage, moves, client } = setup();
    assert.deepEqual(await client.init(), { status: "signed-out" });

    await client.signIn();

    assert.deepEqual(moves, ["reload"]);
    assert.ok(storage.items.has("knowledge-apps:auth:fake-account"));
    const result = await client.init();
    assert.equal(result.status, "signed-in");
    assert.deepEqual(result.status === "signed-in" && result.account, {
      id: "fake-tenant.fake-ada",
      name: "Ada Lovelace",
      username: "ada@example.com",
    });
  });

  test("a token until expire(), then null until signInAgain()", async () => {
    const { client } = setup();
    assert.equal(typeof (await client.getAccessToken()), "string");
    client.expire();
    assert.equal(await client.getAccessToken(), null);
    assert.equal(await client.getAccessToken({ forceRefresh: true }), null);

    const account = await client.signInAgain();
    assert.equal(account.id, "fake-tenant.fake-ada");
    assert.equal(typeof (await client.getAccessToken()), "string");
  });

  test("signOut removes the account and goes home", async () => {
    const { storage, moves, client } = setup();
    await client.signIn();
    await client.signOut();
    assert.equal(storage.items.size, 0);
    assert.deepEqual(moves, ["reload", "home"]);
    assert.deepEqual(await client.init(), { status: "signed-out" });
  });

  test("another client hears the sign-out on the shared channel", async () => {
    const a = setup();
    const b = setup();
    let heard = 0;
    const stop = b.client.onSignedOutElsewhere(() => heard++);
    await a.client.signOut();
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();
    assert.equal(heard, 1);
  });
});
