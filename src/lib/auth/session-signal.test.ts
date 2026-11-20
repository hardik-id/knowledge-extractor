import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSessionSignal } from "./session-signal";

describe("createSessionSignal", () => {
  test("ends once, however often it is told", () => {
    const session = createSessionSignal();
    let heard = 0;
    session.subscribe(() => heard++);

    session.end();
    session.end();
    session.end();

    assert.equal(session.isEnded(), true);
    assert.equal(heard, 1);
  });

  test("resumes only when it had ended, and tells the resume listeners then", () => {
    const session = createSessionSignal();
    let resumed = 0;
    session.onResume(() => resumed++);

    session.resume();
    assert.equal(resumed, 0, "nothing ended, nothing to resume");

    session.end();
    session.resume();
    assert.equal(session.isEnded(), false);
    assert.equal(resumed, 1);
  });

  test("a second end is heard again after a resume", () => {
    const session = createSessionSignal();
    let ends = 0;
    session.subscribe(() => session.isEnded() && ends++);
    session.end();
    session.resume();
    session.end();
    assert.equal(ends, 2);
  });

  test("a listener can stop listening", () => {
    const session = createSessionSignal();
    let heard = 0;
    const stop = session.subscribe(() => heard++);
    stop();
    session.end();
    assert.equal(heard, 0);
  });
});
