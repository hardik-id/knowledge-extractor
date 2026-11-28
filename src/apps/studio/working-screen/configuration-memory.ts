/** Where the browser remembers whether the Configuration row is open: one choice for every workspace. */
export const CONFIGURATION_KEY = "ke.studio.configuration-open";

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Whether the last visit left Configuration open. Closed on a first visit, or when storage is blocked. */
export function readConfigurationOpen(store: Store | null = browserStore()): boolean {
  try {
    return store?.getItem(CONFIGURATION_KEY) === "open";
  } catch {
    return false;
  }
}

/** Remembers the choice. A blocked storage only means it is not remembered. */
export function rememberConfigurationOpen(open: boolean, store: Store | null = browserStore()) {
  try {
    store?.setItem(CONFIGURATION_KEY, open ? "open" : "closed");
  } catch {
    // Not remembered; the screen works the same.
  }
}
