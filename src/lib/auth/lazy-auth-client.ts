import type { AuthClient } from "./auth-client";

/** Loads the real client on first use, so builds and pages that never sign in never fetch its library. */
export function lazyAuthClient(load: () => Promise<AuthClient>): AuthClient {
  let loading: Promise<AuthClient> | null = null;
  const client = () => (loading ??= load());

  return {
    init: async () => (await client()).init(),
    signIn: async () => (await client()).signIn(),
    signInAgain: async () => (await client()).signInAgain(),
    signOut: async () => (await client()).signOut(),
    getAccessToken: async (options) => (await client()).getAccessToken(options),
    onSignedOutElsewhere: (listener) => {
      let stopped = false;
      let stop: (() => void) | null = null;
      void client().then(
        (loaded) => {
          if (stopped) return;
          stop = loaded.onSignedOutElsewhere(listener);
        },
        () => {
          // A failed load surfaces through the other methods.
        },
      );
      return () => {
        stopped = true;
        stop?.();
        stop = null;
      };
    },
  };
}
