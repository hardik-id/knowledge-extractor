"use client";

import { createStore, type Mutate, type StoreApi } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createFilesSlice } from "./slices/files-slice";
import { createNavigationSlice } from "./slices/navigation-slice";
import {
  clearProjectConveniences,
  createNoProjectSlice,
  createProjectSlice,
} from "./slices/project-slice";
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
        ...createNoProjectSlice(...a),
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

/**
 * Makes a store that opens one project at a time (see `createProjectSlice`).
 * The address names the project, so nothing of the run is kept in the
 * browser: the persisted state is empty, and only the active document and
 * source tab are kept, per project, under `<storageKey>:<project id>`.
 */
export function createProjectRunStore(storageKey: string): RunStore {
  const store: RunStore = createStore<PipelineState>()(
    persist(
      (...a) => {
        const base = {
          ...createNavigationSlice(...a),
          ...createFilesSlice(...a),
          ...createRunSlice(...a),
        };
        return { ...base, ...createProjectSlice(storageKey, base)(...a) };
      },
      {
        name: storageKey,
        version: 3,
        storage: createJSONStorage(() => sessionStorage),
        skipHydration: true,
        partialize: () => ({}),
        migrate: () => ({}),
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
const STUDIO_STORAGE_KEY = "knowledge-studio:project";
/** Knowledge Studio's: the project the address names, and its run. */
export const studioRunStore = createProjectRunStore(STUDIO_STORAGE_KEY);

/**
 * Puts both run stores back to their initial state and removes what they
 * saved in sessionStorage (for Studio, every project's conveniences too). Never calls the backend: the person may have no
 * valid token, and the server's runs are not ours to delete here.
 *
 * `hasHydrated` keeps its current value. If the stores were never hydrated
 * (signed out, nothing mounted), <StoreHydrator> still will, and finds nothing
 * saved. If they were (the session ended with the app mounted), they stay
 * hydrated, so <RunSync> and the panels carry on with an empty run instead of
 * waiting for a rehydration that never comes.
 */
export function resetAllRunStores(): void {
  if (typeof window === "undefined") return;
  for (const store of [pipelineRunStore, studioRunStore]) {
    const hasHydrated = store.getState().hasHydrated;
    store.setState({ ...store.getInitialState(), hasHydrated }, true);
    // After the reset: the reset itself writes the initial state to storage.
    store.persist.clearStorage();
  }
  clearProjectConveniences(STUDIO_STORAGE_KEY);
}
