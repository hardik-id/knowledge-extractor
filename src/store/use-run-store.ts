"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { RunStore } from "./pipeline-store";
import type { PipelineState } from "./types";

export const RunStoreContext = createContext<RunStore | null>(null);

/** The store itself, for callbacks that read or write it at the moment they run. */
export function useRunStoreApi(): RunStore {
  const store = useContext(RunStoreContext);
  if (!store) throw new Error("The run store is only available inside <RunStoreProvider>.");
  return store;
}

/** Reads the current app's run store. Same shape as a Zustand hook. */
export function usePipelineStore<T>(selector: (state: PipelineState) => T): T {
  return useStore(useRunStoreApi(), selector);
}
