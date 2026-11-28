import { isAbortError, isUnauthorized } from "@/lib/api/api-error";
import type { SessionSignal } from "@/lib/auth/session-signal";
import type { Person } from "@/services/contracts";

/** `person` is undefined until the API has answered. */
export interface MeSnapshot {
  person: Person | undefined;
  /** The read failed for a reason other than a refused token. */
  failed: boolean;
}

export interface MeStore {
  getSnapshot(): MeSnapshot;
  subscribe(listener: () => void): () => void;
  /** Reads who the person is once, when the app opens; later calls do nothing, except to try again after a failed read. */
  ensureLoaded(): void;
}

/**
 * One shared read of `GET /me`, kept in memory only: nothing about the person's roles is stored
 * in the browser. A refused token (401) is the session's business, so no error here, and the read
 * runs again when the session resumes. The API decides what the person may do; this only tells
 * the UI what to offer.
 */
export function createMeStore(
  read: (signal: AbortSignal) => Promise<Person>,
  session: Pick<SessionSignal, "onResume">,
): MeStore {
  let snapshot: MeSnapshot = { person: undefined, failed: false };
  let started = false;
  let round = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Partial<MeSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of [...listeners]) listener();
  };

  const load = () => {
    const mine = ++round;
    controller?.abort();
    controller = new AbortController();
    set({ failed: false });
    read(controller.signal).then(
      (person) => {
        if (mine === round) set({ person, failed: false });
      },
      (error: unknown) => {
        if (mine !== round || isAbortError(error) || isUnauthorized(error)) return;
        // Unknown, not the previous person: a failed read must not leave their roles on screen.
        set({ person: undefined, failed: true });
      },
    );
  };

  session.onResume(() => {
    if (!started) return;
    // Someone else may have signed in: forget the previous person until the API says who this is.
    set({ person: undefined });
    load();
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
      if (started && !snapshot.failed) return;
      started = true;
      load();
    },
  };
}
