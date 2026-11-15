"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createFilesSlice } from "./slices/files-slice";
import { createNavigationSlice } from "./slices/navigation-slice";
import { createRunSlice } from "./slices/run-slice";
import type { PipelineState } from "./types";

/**
 * One store for the whole pipeline run, composed from slices.
 *
 * Only what the server doesn't know is persisted to sessionStorage: which run
 * this tab is on, the selection, and how far the person has clicked through.
 * The run's files and cells are fetched again after a reload (see <RunSync>),
 * so work that was running carries on instead of being reset.
 * `skipHydration` avoids server/client mismatches: <StoreHydrator> rehydrates after mount.
 */
export const usePipelineStore = create<PipelineState>()(
  persist(
    (...a) => ({
      ...createNavigationSlice(...a),
      ...createFilesSlice(...a),
      ...createRunSlice(...a),
    }),
    {
      name: "knowledge-extractor:run",
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
        usePipelineStore.setState({ hasHydrated: true });
      },
    },
  ),
);
