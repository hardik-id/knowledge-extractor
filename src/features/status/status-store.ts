import { isAbortError, isUnauthorized } from "@/lib/api/api-error";
import type { SessionSignal } from "@/lib/auth/session-signal";
import type { BackendStatus, StatusApi } from "@/services/contracts";

/** What every badge in the app shows: one read, shared. `status`: null = not reported, undefined = no answer yet. */
export interface StatusSnapshot {
  status: BackendStatus | null | undefined;
  /** The read failed for a reason other than a 404 or a refused token. */
  failed: boolean;
  testing: boolean;
  /** Set after a test, until the next read. */
  tested: { cached: boolean; at: number } | null;
}

export interface StatusStore {
  getSnapshot(): StatusSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reads the status once when the app opens; later calls do nothing. */
  ensureLoaded(): void;
  /** Reads it again (the panel opened). */
  refresh(): void;
  test(): void;
}

/**
 * One shared load for every badge (the shell has two, Studio keeps hidden pages): one read when
 * the app opens, one each time a panel opens, no polling. A refused token (401) is the session's
 * business: no error here, and the read runs again when the session resumes. A test that answers
 * after a newer read started is dropped, so it can't overwrite it.
 */
export function createStatusStore(
  api: StatusApi,
  session: Pick<SessionSignal, "onResume">,
  onTestFailure: (error: unknown) => void = () => {},
): StatusStore {
  let snapshot: StatusSnapshot = { status: undefined, failed: false, testing: false, tested: null };
  let round = 0;
  let started = false;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Partial<StatusSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
  };

  const load = () => {
    const mine = ++round;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    set({ tested: null, failed: false });
    api.get(signal).then(
      (status) => {
        if (mine === round) set({ status });
      },
      (error: unknown) => {
        if (mine !== round || isAbortError(error)) return;
        // A refused token waits for the session; it is not "couldn't read".
        if (!isUnauthorized(error)) set({ failed: true });
      },
    );
  };

  session.onResume(() => {
    if (started) load();
  });

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensureLoaded: () => {
      if (started) return;
      started = true;
      load();
    },
    refresh: () => {
      started = true;
      load();
    },
    test: () => {
      if (snapshot.testing) return;
      const mine = round;
      set({ testing: true });
      api.test().then(
        (result) => {
          if (mine !== round) return set({ testing: false });
          if (result)
            set({
              testing: false,
              status: result.status,
              tested: { cached: result.cached, at: Date.now() },
            });
          else {
            set({ testing: false });
            load();
          }
        },
        (error: unknown) => {
          set({ testing: false });
          if (!isUnauthorized(error)) onTestFailure(error);
        },
      );
    },
  };
}
