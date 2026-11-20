/**
 * Whether the person's session has ended, as one fact for the whole app.
 *
 * The first request the API still refuses after a token refresh ends it
 * (`end()`, from the token provider); signing in again, or pasting a token the
 * API accepts, resumes it (`resume()`). While it is ended, loads that failed
 * with a refused token stay quiet instead of each showing its own error, and
 * the socket does not ask for tickets. When it resumes they run again.
 *
 * No React and no browser globals: tests make their own with `createSessionSignal`.
 */
export interface SessionSignal {
  isEnded(): boolean;
  /** Ends the session. A no-op when it already has ended: listeners hear it once. */
  end(): void;
  /** The person signed in again. A no-op when the session had not ended. */
  resume(): void;
  /** Called when the session ends or resumes. */
  subscribe(listener: () => void): () => void;
  /** Called when the session resumes (and only then). */
  onResume(listener: () => void): () => void;
}

export function createSessionSignal(): SessionSignal {
  let ended = false;
  const changes = new Set<() => void>();
  const resumes = new Set<() => void>();
  const tell = (listeners: Set<() => void>) => {
    for (const listener of [...listeners]) listener();
  };

  return {
    isEnded: () => ended,
    end: () => {
      if (ended) return;
      ended = true;
      tell(changes);
    },
    resume: () => {
      if (!ended) return;
      ended = false;
      tell(changes);
      tell(resumes);
    },
    subscribe: (listener) => {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
    onResume: (listener) => {
      resumes.add(listener);
      return () => {
        resumes.delete(listener);
      };
    },
  };
}

/** The app's one session. Token providers report to it; pages and the socket read it. */
export const appSession: SessionSignal = createSessionSignal();
