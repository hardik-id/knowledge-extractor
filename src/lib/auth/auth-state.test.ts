import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { memoryStorage } from "./test-storage";
import { accountChanged, createAuthFlags, initialAuthState, shouldAutoSignIn } from "./auth-state";

const ada = { id: "t.ada", name: "Ada", username: "ada@example.com" };

describe("auth state rules", () => {
  test("starts loading with nobody signed in", () => {
    assert.deepEqual(initialAuthState, { status: "loading", account: null, message: null });
  });

  test("auto sign-in only for a signed-out result with the flag off", () => {
    assert.equal(shouldAutoSignIn({ status: "signed-out" }, false), true);
    assert.equal(shouldAutoSignIn({ status: "signed-out" }, true), false);
    assert.equal(shouldAutoSignIn({ status: "signed-in", account: ada }, false), false);
    assert.equal(shouldAutoSignIn({ status: "error", message: "x" }, false), false);
  });

  test("the account changed only when there was a different previous one", () => {
    assert.equal(accountChanged(null, ada), false);
    assert.equal(accountChanged("t.ada", ada), false);
    assert.equal(accountChanged("t.grace", ada), true);
  });
});

describe("createAuthFlags", () => {
  test("keeps both flags under their keys", () => {
    const storage = memoryStorage();
    const flags = createAuthFlags(storage);
    assert.equal(flags.getAutoOff(), false);
    assert.equal(flags.getLastAccountId(), null);

    flags.setAutoOff(true);
    flags.setLastAccountId("t.ada");
    assert.equal(flags.getAutoOff(), true);
    assert.equal(flags.getLastAccountId(), "t.ada");
    assert.ok(storage.items.has("knowledge-apps:auth:no-auto"));
    assert.equal(storage.items.get("knowledge-apps:auth:account"), "t.ada");

    flags.setAutoOff(false);
    flags.setLastAccountId(null);
    assert.equal(storage.items.size, 0);
  });

  test("no storage behaves as empty", () => {
    const flags = createAuthFlags(null);
    flags.setAutoOff(true);
    flags.setLastAccountId("x");
    assert.equal(flags.getAutoOff(), false);
    assert.equal(flags.getLastAccountId(), null);
  });

  test("storage that throws behaves as empty", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    const flags = createAuthFlags({ getItem: boom, setItem: boom, removeItem: boom });
    flags.setAutoOff(true);
    flags.setLastAccountId(null);
    assert.equal(flags.getAutoOff(), false);
    assert.equal(flags.getLastAccountId(), null);
  });
});
