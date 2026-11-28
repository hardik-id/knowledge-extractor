"use client";

import { useEffect, useSyncExternalStore } from "react";
import { appSession } from "@/lib/auth/session-signal";
import { services } from "@/services";
import type { Person } from "@/services/contracts";
import { createMeStore, type MeSnapshot } from "./me-store";

/** The app's one read of who the person is: loaded when the app opens and when the session resumes. */
const meStore = createMeStore((signal) => services.me(signal), appSession);

const EMPTY: MeSnapshot = { person: undefined, failed: false };

/** The signed-in person: `undefined` until the API has answered (or when it could not). */
export function useMe(): { person: Person | undefined; failed: boolean } {
  const snapshot = useSyncExternalStore(meStore.subscribe, meStore.getSnapshot, () => EMPTY);
  useEffect(() => meStore.ensureLoaded(), []);
  return snapshot;
}
