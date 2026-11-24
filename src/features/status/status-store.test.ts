import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import { createSessionSignal } from "@/lib/auth/session-signal";
import type { BackendStatus, StatusApi, StatusTestResult } from "@/services/contracts";
import { createStatusStore } from "./status-store";

const status = (label: string): BackendStatus => ({
  environment: "local",
  parts: [{ id: "worker", mode: "real", label, state: "ok", checkedAt: null, problem: null }],
});
const unauthorized = () => new ApiError({ status: 401, code: "unauthorized", message: "no" });

/** An API whose answers a test releases by hand. */
function manualApi() {
  const gets: { resolve(v: BackendStatus | null): void; reject(e: unknown): void }[] = [];
  const tests: { resolve(v: StatusTestResult | null): void; reject(e: unknown): void }[] = [];
  const api: StatusApi = {
    get: () => new Promise((resolve, reject) => gets.push({ resolve, reject })),
    test: () => new Promise((resolve, reject) => tests.push({ resolve, reject })),
  };
  return { api, gets, tests };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createStatusStore", () => {
  test("many badges, one load; each refresh is one more", async () => {
    const { api, gets } = manualApi();
    const store = createStatusStore(api, createSessionSignal());
    store.ensureLoaded();
    store.ensureLoaded();
    store.ensureLoaded();
    assert.equal(gets.length, 1);
    gets[0].resolve(status("a"));
    await tick();
    assert.equal(store.getSnapshot().status?.parts[0].label, "a");
    store.refresh();
    assert.equal(gets.length, 2);
  });

  test("a 404 (null) is an answer, not a failure", async () => {
    const { api, gets } = manualApi();
    const store = createStatusStore(api, createSessionSignal());
    store.ensureLoaded();
    gets[0].resolve(null);
    await tick();
    assert.equal(store.getSnapshot().status, null);
    assert.equal(store.getSnapshot().failed, false);
  });

  test("a 401 on the read is quiet and runs again when the session resumes", async () => {
    const { api, gets } = manualApi();
    const session = createSessionSignal();
    const store = createStatusStore(api, session);
    store.ensureLoaded();
    session.end();
    gets[0].reject(unauthorized());
    await tick();
    assert.equal(store.getSnapshot().failed, false);
    assert.equal(store.getSnapshot().status, undefined);
    session.resume();
    assert.equal(gets.length, 2);
  });

  test("another failure is reported as failed", async () => {
    const { api, gets } = manualApi();
    const store = createStatusStore(api, createSessionSignal());
    store.ensureLoaded();
    gets[0].reject(new ApiError({ status: 500, code: "error", message: "x" }));
    await tick();
    assert.equal(store.getSnapshot().failed, true);
  });

  test("a 401 on the test says nothing; another failure is reported", async () => {
    const { api, tests } = manualApi();
    const reported: unknown[] = [];
    const store = createStatusStore(api, createSessionSignal(), (e) => reported.push(e));
    store.test();
    tests[0].reject(unauthorized());
    await tick();
    assert.equal(reported.length, 0);
    assert.equal(store.getSnapshot().testing, false);
    store.test();
    tests[1].reject(new ApiError({ status: 500, code: "error", message: "x" }));
    await tick();
    assert.equal(reported.length, 1);
  });

  test("a test that answers after a newer read began does not overwrite it", async () => {
    const { api, gets, tests } = manualApi();
    const store = createStatusStore(api, createSessionSignal());
    store.ensureLoaded();
    gets[0].resolve(status("first"));
    await tick();
    store.test();
    store.refresh(); // the panel was closed and opened again
    gets[1].resolve(status("newer"));
    await tick();
    tests[0].resolve({ status: status("stale test"), cached: false });
    await tick();
    assert.equal(store.getSnapshot().status?.parts[0].label, "newer");
    assert.equal(store.getSnapshot().testing, false);
  });

  test("a test answer replaces the status and says whether it was cached", async () => {
    const { api, gets, tests } = manualApi();
    const store = createStatusStore(api, createSessionSignal());
    store.ensureLoaded();
    gets[0].resolve(status("first"));
    await tick();
    store.test();
    tests[0].resolve({ status: status("tested"), cached: true });
    await tick();
    assert.equal(store.getSnapshot().status?.parts[0].label, "tested");
    assert.equal(store.getSnapshot().tested?.cached, true);
  });
});
