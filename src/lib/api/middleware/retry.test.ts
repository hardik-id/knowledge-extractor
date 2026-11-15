import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiRequest, HttpMethod, Next } from "../http-client";
import { retryDelay, retryMiddleware } from "./retry";

const request = (method: HttpMethod = "GET", signal?: AbortSignal): ApiRequest => ({
  method,
  url: "https://api.test/runs/1",
  headers: new Headers(),
  signal,
});

/** Answers each call with the next outcome in the list: a status, or an error to throw. */
function server(...outcomes: (number | Error)[]) {
  let calls = 0;
  const next: Next = async () => {
    const outcome = outcomes[Math.min(calls, outcomes.length - 1)];
    calls++;
    if (outcome instanceof Error) throw outcome;
    return new Response(null, { status: outcome });
  };
  return { next, calls: () => calls };
}

/** No real waiting in tests. */
const instant = { sleep: async () => {} };

describe("retryMiddleware", () => {
  test("retries a GET that got a 503 until it works", async () => {
    const { next, calls } = server(503, 503, 200);
    const response = await retryMiddleware(instant)(request(), next);
    assert.equal(response.status, 200);
    assert.equal(calls(), 3);
  });

  test("retries a GET that got no response", async () => {
    const { next, calls } = server(new TypeError("fetch failed"), 200);
    const response = await retryMiddleware(instant)(request(), next);
    assert.equal(response.status, 200);
    assert.equal(calls(), 2);
  });

  test("gives up after the allowed attempts and hands back the last outcome", async () => {
    const failing = server(503);
    const response = await retryMiddleware({ ...instant, retries: 2 })(request(), failing.next);
    assert.equal(response.status, 503);
    assert.equal(failing.calls(), 3);

    const offline = server(new TypeError("fetch failed"));
    await assert.rejects(
      retryMiddleware({ ...instant, retries: 1 })(request(), offline.next),
      TypeError,
    );
    assert.equal(offline.calls(), 2);
  });

  test("never retries a write: it may already have been carried out", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const { next, calls } = server(503, 200);
      const response = await retryMiddleware(instant)(request(method), next);
      assert.equal(response.status, 503, method);
      assert.equal(calls(), 1, method);
    }
  });

  test("does not retry answers that will not change: 4xx and 500", async () => {
    for (const status of [400, 404, 409, 500]) {
      const { next, calls } = server(status, 200);
      const response = await retryMiddleware(instant)(request(), next);
      assert.equal(response.status, status);
      assert.equal(calls(), 1);
    }
  });

  test("does not retry a call its caller cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const { next, calls } = server(new DOMException("Aborted", "AbortError"), 200);
    await assert.rejects(retryMiddleware(instant)(request("GET", controller.signal), next));
    assert.equal(calls(), 1);
  });
});

describe("retryDelay", () => {
  test("doubles per attempt up to the cap, scaled by the random factor", () => {
    const full = () => 1;
    assert.equal(retryDelay(0, 300, 3_000, full), 300);
    assert.equal(retryDelay(1, 300, 3_000, full), 600);
    assert.equal(retryDelay(2, 300, 3_000, full), 1_200);
    assert.equal(retryDelay(10, 300, 3_000, full), 3_000);
    assert.equal(
      retryDelay(1, 300, 3_000, () => 0.5),
      300,
    );
    assert.equal(
      retryDelay(1, 300, 3_000, () => 0),
      0,
    );
  });
});
