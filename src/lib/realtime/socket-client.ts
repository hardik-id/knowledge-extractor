/**
 * A WebSocket that keeps itself connected. It reconnects with backoff, tells
 * the caller every time it (re)opens so missed updates can be refetched, and
 * can detect a dead connection with a heartbeat. No knowledge of what the
 * messages mean: that belongs to the caller.
 */

export type SocketState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

export interface HeartbeatOptions {
  /** How often to send a ping. */
  intervalMs: number;
  /** Reconnect if nothing at all arrived for this long after a ping. */
  timeoutMs: number;
  /** What to send. The server must answer with any message. */
  message: string;
}

export interface SocketClientOptions {
  /** Called before every attempt, so a fresh one-time ticket can be put in the URL. */
  url: () => string | Promise<string>;
  /** Receives each message, JSON-parsed. */
  onMessage: (data: unknown) => void;
  onStateChange?: (state: SocketState) => void;
  /** Fires on every successful open. `reconnect` is false for the first one. */
  onOpen?: (info: { reconnect: boolean }) => void;
  backoff?: Partial<BackoffOptions>;
  /** Off unless given: the server has to reply to pings for this to work. */
  heartbeat?: HeartbeatOptions;
  /** Close codes that mean "do not try again" (e.g. no access to this run). */
  fatalCloseCodes?: readonly number[];
  /**
   * While this says true the client neither asks for a URL (a ticket) nor tries again:
   * it waits for `onUnblocked`. For a session that has ended, until the person signs in again.
   */
  blocked?: () => boolean;
  /** Calls the listener when `blocked` may have turned false. Returns a function that stops listening. */
  onUnblocked?: (listener: () => void) => () => void;
  /** Replaceable for tests. */
  WebSocketImpl?: typeof WebSocket;
  random?: () => number;
}

export interface SocketClient {
  connect(): void;
  /** Stop for good. No more callbacks fire after this. */
  close(): void;
  getState(): SocketState;
}

const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 500, maxMs: 15_000 };
const DEFAULT_FATAL_CODES = [4403, 4404];

/**
 * Wait before reconnect attempt `attempt` (0-based): doubles each time up to
 * `maxMs`, then takes a random 50–100% of that so clients don't reconnect in step.
 */
export function backoffDelay(
  attempt: number,
  { baseMs, maxMs }: BackoffOptions,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function createSocketClient(options: SocketClientOptions): SocketClient {
  const backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
  const fatalCodes = options.fatalCloseCodes ?? DEFAULT_FATAL_CODES;
  const random = options.random ?? Math.random;

  let state: SocketState = "idle";
  let socket: WebSocket | null = null;
  let attempt = 0;
  let hasOpened = false;
  /** Bumped whenever the current connection attempt is abandoned, so late callbacks can tell. */
  let generation = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivity = 0;
  let stopWaiting: (() => void) | null = null;

  const setState = (next: SocketState) => {
    if (state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const startHeartbeat = (ws: WebSocket) => {
    const heartbeat = options.heartbeat;
    if (!heartbeat) return;
    lastActivity = Date.now();
    heartbeatTimer = setInterval(() => {
      if (Date.now() - lastActivity > heartbeat.intervalMs + heartbeat.timeoutMs) {
        ws.close(); // dead connection: onclose schedules the reconnect
        return;
      }
      ws.send(heartbeat.message);
    }, heartbeat.intervalMs);
  };

  const isBlocked = () => options.blocked?.() === true && options.onUnblocked !== undefined;

  /** Sits still until the block is lifted, then starts over with a fresh backoff. */
  const waitForUnblock = () => {
    setState("reconnecting");
    stopWaiting?.();
    stopWaiting = options.onUnblocked!(() => {
      if (isBlocked()) return;
      stopWaiting?.();
      stopWaiting = null;
      attempt = 0;
      void open();
    });
  };

  const scheduleReconnect = () => {
    if (isBlocked()) {
      waitForUnblock();
      return;
    }
    setState("reconnecting");
    const delay = backoffDelay(attempt, backoff, random);
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void open();
    }, delay);
  };

  const open = async () => {
    const mine = ++generation;
    if (isBlocked()) {
      waitForUnblock();
      return;
    }
    const Impl = options.WebSocketImpl ?? WebSocket;

    let ws: WebSocket;
    try {
      const url = await options.url();
      if (mine !== generation) return; // closed or superseded while waiting for the URL
      ws = new Impl(url);
    } catch {
      if (mine === generation) scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = () => {
      if (mine !== generation) return;
      const reconnect = hasOpened;
      hasOpened = true;
      attempt = 0;
      setState("open");
      startHeartbeat(ws);
      options.onOpen?.({ reconnect });
    };

    ws.onmessage = (event: MessageEvent) => {
      if (mine !== generation) return;
      lastActivity = Date.now();
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return; // not JSON: nothing the caller can use
      }
      options.onMessage(data);
    };

    ws.onclose = (event: CloseEvent) => {
      if (mine !== generation) return;
      stopHeartbeat();
      socket = null;
      if (fatalCodes.includes(event.code)) setState("closed");
      else scheduleReconnect();
    };
  };

  const onOnline = () => {
    // Don't sit out the rest of a long backoff once the network is back.
    if (state !== "reconnecting" || !reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    attempt = 0;
    void open();
  };

  return {
    connect() {
      if (state !== "idle" && state !== "closed") return;
      if (typeof window !== "undefined") window.addEventListener("online", onOnline);
      attempt = 0;
      setState("connecting");
      void open();
    },

    close() {
      generation++;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      stopWaiting?.();
      stopWaiting = null;
      stopHeartbeat();
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
      socket?.close(1000);
      socket = null;
      state = "closed"; // silent: the caller asked for this
    },

    getState: () => state,
  };
}
