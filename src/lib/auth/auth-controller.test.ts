import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  SignInWindowError,
  type AuthAccount,
  type AuthClient,
  type AuthInitResult,
} from "./auth-client";
import { createAuthController } from "./auth-controller";
import { createAuthFlags } from "./auth-state";
import { memoryStorage } from "./test-storage";
import { createAuthTokenProvider } from "./auth-token-provider";

const ada: AuthAccount = { id: "t.ada", name: "Ada", username: "ada@example.com" };
const grace: AuthAccount = { id: "t.grace", name: "Grace", username: "grace@example.com" };

function setup(init: AuthInitResult, preset?: { autoOff?: boolean; last?: string }) {
  const storage = memoryStorage();
  const flags = createAuthFlags(storage);
  if (preset?.autoOff) flags.setAutoOff(true);
  if (preset?.last) flags.setLastAccountId(preset.last);

  const log: string[] = [];
  let elsewhere: (() => void) | null = null;
  const behaviour = {
    signIn: async () => {},
    signInAgain: async (): Promise<AuthAccount> => ada,
  };
  const client: AuthClient = {
    init: async () => init,
    signIn: async () => {
      log.push(`signIn autoOff=${flags.getAutoOff()}`);
      await behaviour.signIn();
    },
    signInAgain: () => behaviour.signInAgain(),
    signOut: async () => void log.push("signOut"),
    getAccessToken: async () => "t",
    onSignedOutElsewhere: (l) => {
      elsewhere = l;
      return () => {};
    },
  };
  const tokens = createAuthTokenProvider(client);
  const controller = createAuthController({
    client,
    tokens,
    flags,
    clearData: () => void log.push("clearData"),
  });
  let notified = 0;
  controller.subscribe(() => notified++);
  return {
    controller,
    flags,
    tokens,
    log,
    behaviour,
    notified: () => notified,
    fireElsewhere: () => elsewhere?.(),
  };
}

describe("auth controller start", () => {
  test("signed in: stores the account, clears the auto flag, no clearData for the first person", async () => {
    const t = setup({ status: "signed-in", account: ada }, { autoOff: true });
    await t.controller.start();
    assert.deepEqual(t.controller.getState(), { status: "signed-in", account: ada, message: null });
    assert.equal(t.flags.getLastAccountId(), "t.ada");
    assert.equal(t.flags.getAutoOff(), false);
    assert.deepEqual(t.log, []);
  });

  test("same person again: no clearData", async () => {
    const t = setup({ status: "signed-in", account: ada }, { last: "t.ada" });
    await t.controller.start();
    assert.deepEqual(t.log, []);
  });

  test("a different person: clearData", async () => {
    const t = setup({ status: "signed-in", account: grace }, { last: "t.ada" });
    await t.controller.start();
    assert.deepEqual(t.log, ["clearData"]);
    assert.equal(t.flags.getLastAccountId(), "t.grace");
  });

  test("signed out with the flag off: sets the flag before signIn and stays loading", async () => {
    const t = setup({ status: "signed-out" });
    await t.controller.start();
    assert.deepEqual(t.log, ["signIn autoOff=true"]);
    assert.equal(t.controller.getState().status, "loading");
  });

  test("signed out with the flag on: shows the sign-in screen", async () => {
    const t = setup({ status: "signed-out" }, { autoOff: true });
    await t.controller.start();
    assert.deepEqual(t.log, []);
    assert.equal(t.controller.getState().status, "signed-out");
  });

  test("auto sign-in that cannot start is an error", async () => {
    const t = setup({ status: "signed-out" });
    t.behaviour.signIn = async () => {
      throw new Error("no navigation");
    };
    await t.controller.start();
    const state = t.controller.getState();
    assert.equal(state.status, "error");
    assert.match(state.message ?? "", /no navigation/);
  });

  test("an init error is an error with its message", async () => {
    const t = setup({ status: "error", message: "Cancelled (user_cancelled)" });
    await t.controller.start();
    assert.deepEqual(t.controller.getState(), {
      status: "error",
      account: null,
      message: "Cancelled (user_cancelled)",
    });
  });

  test("is idempotent", async () => {
    const t = setup({ status: "signed-in", account: ada });
    const first = t.controller.start();
    const second = t.controller.start();
    assert.equal(first, second);
    await first;
    await t.controller.start();
    assert.equal(t.notified(), 1);
  });
});

describe("auth controller while signed in", () => {
  test("an ended session keeps the account and notifies once", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    const before = t.notified();
    t.tokens.onUnauthenticated();
    t.tokens.onUnauthenticated();
    assert.deepEqual(t.controller.getState(), {
      status: "session-ended",
      account: ada,
      message: null,
    });
    assert.equal(t.notified(), before + 1);
  });

  test("an ended session before sign-in finished does not change the state", async () => {
    const t = setup({ status: "signed-out" }, { autoOff: true });
    await t.controller.start();
    t.tokens.onUnauthenticated();
    assert.equal(t.controller.getState().status, "signed-out");
  });

  test("signed out in another tab", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    t.fireElsewhere();
    assert.equal(t.controller.getState().status, "signed-out");
    assert.equal(t.controller.getState().account, null);
    assert.deepEqual(t.log, ["clearData"]);
    assert.equal(t.flags.getAutoOff(), true);
    assert.equal(t.flags.getLastAccountId(), null);
  });

  test("the state object is stable until something changes", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    assert.equal(t.controller.getState(), t.controller.getState());
  });
});

describe("auth controller actions", () => {
  test("signIn sets the flag, goes loading, then signs in; rejection is an error", async () => {
    const t = setup({ status: "signed-out" }, { autoOff: true });
    await t.controller.start();
    await t.controller.signIn();
    assert.deepEqual(t.log, ["signIn autoOff=true"]);
    assert.equal(t.controller.getState().status, "loading");

    t.behaviour.signIn = async () => {
      throw new Error("blocked");
    };
    await t.controller.signIn();
    assert.equal(t.controller.getState().status, "error");
  });

  test("signInAgain with the same person keeps the data and resumes tokens", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    t.tokens.onUnauthenticated();
    await t.controller.signInAgain();
    assert.equal(t.controller.getState().status, "signed-in");
    assert.deepEqual(t.log, []);
    assert.equal(await t.tokens.getAccessToken(), "t");
  });

  test("signInAgain as someone else clears the data", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    t.tokens.onUnauthenticated();
    t.behaviour.signInAgain = async () => grace;
    await t.controller.signInAgain();
    assert.deepEqual(t.log, ["clearData"]);
    assert.equal(t.flags.getLastAccountId(), "t.grace");
    assert.equal(t.controller.getState().account, grace);
  });

  test("signInAgain failing rethrows and stays session-ended", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    t.tokens.onUnauthenticated();
    t.behaviour.signInAgain = async () => {
      throw new SignInWindowError();
    };
    await assert.rejects(t.controller.signInAgain(), SignInWindowError);
    assert.equal(t.controller.getState().status, "session-ended");
    assert.equal(await t.tokens.getAccessToken(), null);
  });

  test("signOut sets the flags, clears data, then signs out", async () => {
    const t = setup({ status: "signed-in", account: ada });
    await t.controller.start();
    await t.controller.signOut();
    assert.deepEqual(t.log, ["clearData", "signOut"]);
    assert.equal(t.flags.getAutoOff(), true);
    assert.equal(t.flags.getLastAccountId(), null);
  });
});
