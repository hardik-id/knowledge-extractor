import type { BackendStatus, ConnectionState, StatusPart, StatusState } from "@/services/contracts";

/**
 * What the badge says and when it shows. Pure: the badge and the panel only draw it.
 *
 * The overall state is the worst one: a failing real part is a "problem", a stub means "stub"
 * (or "mock data" when the whole backend is the in-browser mock), and "live" is every part
 * real and ok or not yet known. `unknown` is the badge when the backend does not report its
 * status, or has not answered yet.
 */
export type OverallState = "problem" | "stub" | "mock" | "live" | "unknown";

export const OVERALL_WORD: Record<OverallState, string> = {
  problem: "Problem",
  stub: "Stub",
  mock: "Mock data",
  live: "Live",
  unknown: "Status unknown",
};

export function overallState(status: BackendStatus | null | undefined): OverallState {
  if (!status) return "unknown";
  if (status.parts.some((p) => p.state === "failing")) return "problem";
  if (status.parts.some((p) => p.state === "stub" || p.mode === "stub")) {
    return status.environment === "mock" ? "mock" : "stub";
  }
  return "live";
}

/**
 * Development builds always show the badge. A production build only when there is something to
 * say: a stub or a failing part. A backend that does not report its status says nothing.
 */
export function isBadgeVisible(overall: OverallState, development: boolean): boolean {
  if (development) return true;
  return overall === "problem" || overall === "stub" || overall === "mock";
}

const PART_NAMES: Record<string, string> = {
  assistant: "Assistant",
  extraction: "Extraction",
  storage: "Storage",
  sign_in: "Sign-in",
  live_updates: "Live updates",
  worker: "Worker",
  data: "Data",
};

/** A part id as a name: known ones as written in the design, a new one as its id in words. */
export function partName(id: string): string {
  const known = PART_NAMES[id];
  if (known) return known;
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Part";
}

const PROBLEMS: Record<string, string> = {
  auth_failed: "the credentials were refused",
  not_found: "the model or resource was not found",
  rate_limited: "the rate limit was reached",
  timeout: "no answer in time",
  unreachable: "it cannot be reached",
  bad_request: "the request was rejected",
  worker_stalled: "the worker has stopped taking jobs",
  error: "an error occurred",
};

/** A problem code as words. A new code is shown as it came: it is short and holds no secret. */
export function problemWords(code: string | null): string {
  if (!code) return "no reason given";
  return PROBLEMS[code] ?? `${code.replace(/_/g, " ")}`;
}

/**
 * When the browser's own socket to a run is up, it is the better answer for "Live updates" than
 * the server's own check, so it replaces that part. No run open (`idle`): the server's row stays.
 */
export function withSocketState(status: BackendStatus, connection: ConnectionState): BackendStatus {
  if (connection === "idle") return status;
  const own: Record<Exclude<ConnectionState, "idle">, Pick<StatusPart, "label" | "state">> = {
    connecting: { label: "Connecting", state: "unknown" },
    open: { label: "Connected", state: "ok" },
    reconnecting: { label: "Reconnecting", state: "failing" },
    closed: { label: "Closed", state: "failing" },
  };
  const replacement = own[connection];
  return {
    ...status,
    parts: status.parts.map((part) =>
      part.id === "live_updates"
        ? {
            ...part,
            ...replacement,
            mode: "real",
            checkedAt: null,
            problem: replacement.state === "failing" ? "unreachable" : null,
          }
        : part,
    ),
  };
}

/** "2m ago", "just now": coarse on purpose, the panel is not a clock. */
export function agoWords(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 10_000) return "just now";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const STATE_WORD: Record<StatusState, string> = {
  stub: "Stub, nothing to check",
  ok: "OK",
  failing: "Failing",
  unknown: "Not checked yet",
};

/** The line under a part's label: its state in words, with when it was learned or why it fails. */
export function partDetail(part: StatusPart, now: number): string {
  if (part.state === "failing") return `Failing: ${problemWords(part.problem)}`;
  const word = STATE_WORD[part.state];
  if ((part.state === "ok" || part.state === "unknown") && part.checkedAt) {
    return part.state === "ok"
      ? `${word}, checked ${agoWords(part.checkedAt, now)}`
      : `${word}, last checked ${agoWords(part.checkedAt, now)}`;
  }
  return word;
}

/** The newest `checkedAt` of the parts, or null when none was ever checked. */
export function newestCheck(status: BackendStatus): string | null {
  let newest: string | null = null;
  for (const part of status.parts) {
    if (part.checkedAt && (newest === null || Date.parse(part.checkedAt) > Date.parse(newest))) {
      newest = part.checkedAt;
    }
  }
  return newest;
}

/** The sentence after "Test connections": a stored answer says how old it is. */
export function testNote(cached: boolean, status: BackendStatus, now: number): string | null {
  if (!cached) return null;
  const at = newestCheck(status);
  if (!at) return "Checked a moment ago";
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (!Number.isFinite(seconds)) return "Checked a moment ago";
  return `Checked ${seconds} second${seconds === 1 ? "" : "s"} ago`;
}
