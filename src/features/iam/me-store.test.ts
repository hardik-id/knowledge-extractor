import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import { createSessionSignal } from "@/lib/auth/session-signal";
import type { Person } from "@/services/contracts";
import { createMeStore } from "./me-store";

const person = (name: string): Person => ({
  id: 1,
  name,
  preferredUsername: "a@example.com",
  platformAdmin: false,
  tenants: [],
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function manualRead() {
  const calls: { resolve(p: Person): void; reject(e: unknown): void }[] = [];
  const read = () => new Promise<Person>((resolve, reject) => calls.push({ resolve, reject }));
  return { read, calls };
}

describe("createMeStore", () => {
  test("many readers, one load", async () => {
    const { read, calls } = manualRead();
    const store = createMeStore(read, createSessionSignal());
    store.ensureLoaded();
    store.ensureLoaded();
    assert.equal(calls.length, 1);
    assert.equal(store.getSnapshot().person, undefined);
    calls[0].resolve(person("Ada"));
    await tick();
    assert.equal(store.getSnapshot().person?.name, "Ada");
  });

  test("a failed read is flagged; a refused token is the session's business and stays quiet", async () => {
    const { read, calls } = manualRead();
    const store = createMeStore(read, createSessionSignal());
    store.ensureLoaded();
    calls[0].reject(new ApiError({ status: 401, code: "unauthorized", message: "no" }));
    await tick();
    assert.equal(store.getSnapshot().failed, false);
    const other = manualRead();
    const second = createMeStore(other.read, createSessionSignal());
    second.ensureLoaded();
    other.calls[0].reject(new ApiError({ status: 500, code: "server_error", message: "no" }));
    await tick();
    assert.equal(second.getSnapshot().failed, true);
    assert.equal(second.getSnapshot().person, undefined);
  });

  test("reads again when the session resumes", async () => {
    const { read, calls } = manualRead();
    const session = createSessionSignal();
    const store = createMeStore(read, session);
    store.ensureLoaded();
    calls[0].resolve(person("Ada"));
    await tick();
    session.end();
    session.resume();
    assert.equal(calls.length, 2);
    calls[1].resolve(person("Grace"));
    await tick();
    assert.equal(store.getSnapshot().person?.name, "Grace");
  });

  test("a session that resumes before the app asked loads nothing", () => {
    const { read, calls } = manualRead();
    const session = createSessionSignal();
    createMeStore(read, session);
    session.end();
    session.resume();
    assert.equal(calls.length, 0);
  });
});
