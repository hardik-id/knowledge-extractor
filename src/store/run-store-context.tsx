"use client";

import { RunSync } from "@/features/run/run-sync";
import type { RunStore } from "./pipeline-store";
import { StoreHydrator } from "./store-hydrator";
import { RunStoreContext } from "./use-run-store";

/**
 * Gives everything below it the run store of one app, and keeps that store
 * hydrated and in step with its run. `firstHref` is where the person goes
 * when the run is gone.
 */
export function RunStoreProvider({
  store,
  firstHref,
  children,
}: {
  store: RunStore;
  firstHref: string;
  children: React.ReactNode;
}) {
  return (
    <RunStoreContext value={store}>
      <StoreHydrator />
      <RunSync firstHref={firstHref} />
      {children}
    </RunStoreContext>
  );
}
