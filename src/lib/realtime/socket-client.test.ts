import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { backoffDelay, createSocketClient, type SocketState } from "./socket-client";

/** Stands in for the browser's WebSocket. The test plays the server through `sockets`. */
class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  readonly sent: string[] = [];
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

let sockets: FakeSocket[] = [];

/** Lets the client's promises and its (1 ms) reconnect timer run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function connect(overrides: Partial<Parameters<typeof createSocketClient>[0]> = {}) {
  const states: SocketState[] = [];
  const opens: boolean[] = [];
  const messages: unknown[] = [];
  let attempts = 0;
  const client = createSocketClient({
    url: () => `wss://api.test/ws/runs/1/?ticket=${++attempts}`,
    onMessage: (data) => messages.push(data),
    onStateChange: (state) => states.push(state),
    onOpen: ({ reconnect }) => opens.push(reconnect),
    backoff: { baseMs: 1, maxMs: 1 },
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    ...overrides,
  });
  client.connect();
  return { client, states, opens, messages };
}

describe("createSocketClient", () => {
  beforeEach(() => {
    sockets = [];
  });
  afterEach(() => {
    for (const socket of sockets) socket.onclose = null;
  });

  test("while blocked it asks for no URL and tries nothing; once unblocked it connects", async () => {
    let blocked = true;
    const waiting = new Set<() => void>();
    let urls = 0;
    const { client, states } = connect({
      url: () => `wss://api.test/ws/runs/1/?ticket=${++urls}`,
      blocked: () => blocked,
      onUnblocked: (listener) => {
        waiting.add(listener);
        return () => waiting.delete(listener);
      },
    });
    await settle();
    await settle();

    assert.equal(urls, 0, "no ticket was asked for");
    assert.equal(sockets.length, 0);
    assert.deepEqual(states, ["connecting", "reconnecting"]);

    blocked = false;
    for (const listener of [...waiting]) listener();
    await settle();

    assert.equal(urls, 1);
    assert.equal(sockets.length, 1);
    sockets[0].onopen?.();
    assert.deepEqual(states, ["connecting", "reconnecting", "open"]);
    client.close();
  });

  test("a failed ticket after the session ended does not loop: it waits to be unblocked", async () => {
    let blocked = false;
    const waiting = new Set<() => void>();
    let urls = 0;
    const { client } = connect({
      url: () => {
        urls++;
        blocked = true; // the ticket call was refused, which ended the session
        throw new Error("401");
      },
      blocked: () => blocked,
      onUnblocked: (listener) => {
        waiting.add(listener);
        return () => waiting.delete(listener);
      },
    });
    await settle();
    await settle();
    await settle();

    assert.equal(urls, 1, "one attempt, not one per backoff");
    assert.equal(waiting.size, 1);

    client.close();
    assert.equal(waiting.size, 0, "closing stops the wait");
  });

  test("opens, passes on JSON messages and ignores anything else", async () => {
    const { client, states, opens, messages } = connect();
    await settle();
    sockets[0].onopen?.();
    sockets[0].onmessage?.({ data: '{"type":"cell"}' });
    sockets[0].onmessage?.({ data: "not json" });

    assert.deepEqual(states, ["connecting", "open"]);
    assert.deepEqual(opens, [false]);
    assert.deepEqual(messages, [{ type: "cell" }]);
    client.close();
  });

  test("reconnects after a drop, with a fresh URL, and says it is a reconnect", async () => {
    const { client, states, opens } = connect();
    await settle();
    sockets[0].onopen?.();
    sockets[0].onclose?.({ code: 1006 });
    await settle();

    assert.equal(sockets.length, 2);
    assert.notEqual(sockets[1].url, sockets[0].url);
    sockets[1].onopen?.();

    assert.deepEqual(states, ["connecting", "open", "reconnecting", "open"]);
    assert.deepEqual(opens, [false, true]);
    client.close();
  });

  test("keeps trying when the URL can't be built (e.g. no ticket)", async () => {
    let calls = 0;
    const { client, states } = connect({
      url: () => {
        if (++calls === 1) throw new Error("ticket refused");
        return "wss://api.test/ws/runs/1/";
      },
    });
    await settle();

    assert.equal(sockets.length, 1);
    assert.deepEqual(states, ["connecting", "reconnecting"]);
    client.close();
  });

  test("stops for good on a close code that means no access", async () => {
    const { client, states } = connect();
    await settle();
    sockets[0].onopen?.();
    sockets[0].onclose?.({ code: 4403 });
    await settle();

    assert.equal(sockets.length, 1);
    assert.deepEqual(states, ["connecting", "open", "closed"]);
    assert.equal(client.getState(), "closed");
  });

  test("close() ends it: no reconnect and no more callbacks", async () => {
    const { client, states, messages } = connect();
    await settle();
    const socket = sockets[0];
    socket.onopen?.();
    client.close();
    socket.onmessage?.({ data: "{}" });
    socket.onclose?.({ code: 1006 });
    await settle();

    assert.equal(socket.closed, true);
    assert.equal(sockets.length, 1);
    assert.deepEqual(states, ["connecting", "open"]);
    assert.deepEqual(messages, []);
  });
});

describe("backoffDelay", () => {
  const options = { baseMs: 500, maxMs: 15_000 };

  test("doubles with each attempt up to the cap", () => {
    const top = () => 1;
    assert.equal(backoffDelay(0, options, top), 500);
    assert.equal(backoffDelay(1, options, top), 1_000);
    assert.equal(backoffDelay(3, options, top), 4_000);
    assert.equal(backoffDelay(20, options, top), 15_000);
  });

  test("picks a wait between half and all of that, so clients don't reconnect in step", () => {
    assert.equal(
      backoffDelay(1, options, () => 0),
      500,
    );
    assert.equal(
      backoffDelay(1, options, () => 0.5),
      750,
    );
  });
});
