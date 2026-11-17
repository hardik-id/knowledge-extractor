"use client";

import { createStore, type Mutate, type StoreApi } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createFilesSlice } from "./slices/files-slice";
import { createNavigationSlice } from "./slices/navigation-slice";
import { createRunSlice } from "./slices/run-slice";
import type { PipelineState } from "./types";

/** A run store: the Zustand store API plus the persist controls. */
export type RunStore = Mutate<StoreApi<PipelineState>, [["zustand/persist", unknown]]>;

/**
 * Makes one store for one app's run, composed from slices. Each app has its own,
 * with its own sessionStorage key, so switching apps never mixes runs.
 *
 * Only what the server doesn't know is persisted to sessionStorage: which run
 * this tab is on, the selection, and how far the person has clicked through.
 * The run's files and cells are fetched again after a reload (see <RunSync>),
 * so work that was running carries on instead of being reset.
 * `skipHydration` avoids server/client mismatches: <StoreHydrator> rehydrates after mount.
 */
export function createRunStore(storageKey: string): RunStore {
  const store: RunStore = createStore<PipelineState>()(
    persist(
      (...a) => ({
        ...createNavigationSlice(...a),
        ...createFilesSlice(...a),
        ...createRunSlice(...a),
      }),
      {
        name: storageKey,
        version: 2,
        storage: createJSONStorage(() => sessionStorage),
        skipHydration: true,
        partialize: (s) => ({
          runId: s.runId,
          selectedFiles: s.selectedFiles,
          activeSource: s.activeSource,
          proceededStages: s.proceededStages,
          activeDocId: s.activeDocId,
        }),
        // Version 1 kept stage status and documents in the browser. None of it maps
        // onto a server run, so start clean.
        migrate: (persisted, version) => (version < 2 ? {} : persisted),
        onRehydrateStorage: () => () => {
          store.setState({ hasHydrated: true });
        },
      },
    ),
  );
  return store;
}

// The hooks live in use-run-store.ts; they are re-exported so consumers import from here.
export { usePipelineStore, useRunStoreApi } from "./use-run-store";

/** The pipeline app's run. The key is the one used before there were several apps. */
export const pipelineRunStore = createRunStore("knowledge-extractor:run");
/** Knowledge Studio's run. */
export const studioRunStore = createRunStore("knowledge-studio:run");
