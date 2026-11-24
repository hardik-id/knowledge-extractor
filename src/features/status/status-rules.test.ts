import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BackendStatus, StatusPart } from "@/services/contracts";
import {
  agoWords,
  isBadgeVisible,
  overallState,
  partDetail,
  partName,
  problemWords,
  testNote,
  withSocketState,
} from "./status-rules";

const part = (over: Partial<StatusPart> & { id: string }): StatusPart => ({
  mode: "real",
  label: "Thing",
  state: "ok",
  checkedAt: null,
  problem: null,
  ...over,
});
const status = (parts: StatusPart[], environment = "local"): BackendStatus => ({
  environment,
  parts,
});

describe("overallState", () => {
  test("a backend that reports nothing is unknown", () => {
    assert.equal(overallState(null), "unknown");
    assert.equal(overallState(undefined), "unknown");
  });
  test("an empty list of parts is unknown, not live", () => {
    assert.equal(overallState(status([])), "unknown");
  });
  test("a failing real part is a problem, even beside stubs", () => {
    const s = status([
      part({ id: "assistant", mode: "stub", state: "stub" }),
      part({ id: "worker", state: "failing", problem: "worker_stalled" }),
    ]);
    assert.equal(overallState(s), "problem");
  });
  test("any stub is a stub, or mock data in the mock", () => {
    const parts = [part({ id: "a" }), part({ id: "b", mode: "stub", state: "stub" })];
    assert.equal(overallState(status(parts)), "stub");
    assert.equal(overallState(status(parts, "mock")), "mock");
  });
  test("every part real and ok or unknown is live", () => {
    const s = status([part({ id: "a" }), part({ id: "b", state: "unknown" })]);
    assert.equal(overallState(s), "live");
  });
});

describe("isBadgeVisible", () => {
  test("development always shows it", () => {
    for (const o of ["problem", "stub", "mock", "live", "unknown"] as const) {
      assert.equal(isBadgeVisible(o, true), true);
    }
  });
  test("production shows it only for a stub or a problem", () => {
    assert.equal(isBadgeVisible("live", false), false);
    assert.equal(isBadgeVisible("unknown", false), false);
    assert.equal(isBadgeVisible("stub", false), true);
    assert.equal(isBadgeVisible("mock", false), true);
    assert.equal(isBadgeVisible("problem", false), true);
  });
});

describe("withSocketState", () => {
  const base = status([part({ id: "live_updates", label: "Redis" }), part({ id: "worker" })]);
  test("no run open keeps the server's row", () => {
    assert.equal(withSocketState(base, "idle"), base);
  });
  test("an open socket replaces the live updates row only", () => {
    const next = withSocketState(base, "open");
    assert.equal(next.parts[0].label, "Connected");
    assert.equal(next.parts[0].state, "ok");
    assert.equal(next.parts[1], base.parts[1]);
  });
  test("connecting and reconnecting are unknown, never a problem", () => {
    for (const connection of ["connecting", "reconnecting"] as const) {
      const next = withSocketState(base, connection);
      assert.equal(next.parts[0].state, "unknown");
      assert.equal(overallState(next), "live");
    }
    assert.equal(withSocketState(base, "reconnecting").parts[0].label, "Reconnecting");
  });
  test("only a socket closed for good is failing", () => {
    const next = withSocketState(base, "closed");
    assert.equal(next.parts[0].state, "failing");
    assert.equal(overallState(next), "problem");
  });
  test("an ended session makes the row unknown, whatever the socket says", () => {
    for (const connection of ["connecting", "open", "reconnecting", "closed"] as const) {
      const next = withSocketState(base, connection, true);
      assert.equal(next.parts[0].state, "unknown");
      assert.equal(overallState(next), "live");
    }
  });
});

describe("words", () => {
  test("part names: known, and an id this UI has not seen", () => {
    assert.equal(partName("sign_in"), "Sign-in");
    assert.equal(partName("search_index"), "Search index");
  });
  test("problem codes become words, a new code is kept", () => {
    assert.equal(problemWords("auth_failed"), "the credentials were refused");
    assert.equal(problemWords("disk_full"), "disk full");
    assert.equal(problemWords(null), "no reason given");
  });
  test("agoWords", () => {
    const now = Date.parse("2026-11-24T10:10:00Z");
    assert.equal(agoWords("2026-11-24T10:09:58Z", now), "just now");
    assert.equal(agoWords("2026-11-24T10:09:00Z", now), "1m ago");
    assert.equal(agoWords("2026-11-24T10:08:00Z", now), "2m ago");
    assert.equal(agoWords("2026-11-24T07:10:00Z", now), "3h ago");
  });
  test("partDetail pairs the state with a word", () => {
    const now = Date.parse("2026-11-24T10:02:00Z");
    assert.equal(partDetail(part({ id: "a", state: "stub" }), now), "Stub, nothing to check");
    assert.equal(
      partDetail(part({ id: "a", checkedAt: "2026-11-24T10:00:00Z" }), now),
      "OK, checked 2m ago",
    );
    assert.equal(
      partDetail(part({ id: "a", state: "failing", problem: "timeout" }), now),
      "Failing: no answer in time",
    );
    assert.equal(partDetail(part({ id: "a", state: "unknown" }), now), "Not checked yet");
  });
  test("testNote says how old a stored answer is, and nothing for a fresh one", () => {
    const s = status([part({ id: "a", checkedAt: "2026-11-24T10:00:00Z" })]);
    const now = Date.parse("2026-11-24T10:00:42Z");
    assert.equal(testNote(true, s, now), "Checked 42 seconds ago");
    assert.equal(testNote(false, s, now), null);
  });
});
