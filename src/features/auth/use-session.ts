"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { appSession } from "@/lib/auth/session-signal";

/** True from the first refused token until the person signs in again (or pastes a token the API accepts). */
export function useSessionEnded(): boolean {
  return useSyncExternalStore(appSession.subscribe, appSession.isEnded, () => false);
}

/** Runs `callback` when the person has signed in again, so a load that was refused can run again by itself. */
export function useOnSessionResumed(callback: () => void): void {
  const run = useEffectEvent(callback);
  useEffect(() => appSession.onResume(() => run()), []);
}
