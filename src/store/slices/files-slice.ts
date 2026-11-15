import type { SourceFile } from "@/types/pipeline";
import type { FilesSlice, SliceCreator } from "../types";

export const createFilesSlice: SliceCreator<FilesSlice> = (set, get) => {
  /** A new selection makes the run and all work on it obsolete. */
  const applySelection = (selectedFiles: SourceFile[]) => {
    // A run is being created from the current selection: too late to change it.
    if (get().creatingRun) return;
    set({ selectedFiles });
    get().invalidateFrom("select");
    get().discardRun();
  };

  return {
    activeSource: "confluence",
    searchQuery: "",
    selectedFiles: [],

    setActiveSource: (activeSource) => set({ activeSource, searchQuery: "" }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

    toggleFile: (file) => {
      const current = get().selectedFiles;
      applySelection(
        current.some((f) => f.id === file.id)
          ? current.filter((f) => f.id !== file.id)
          : [...current, file],
      );
    },

    setSelection: (files) => applySelection([...new Map(files.map((f) => [f.id, f])).values()]),
    clearSelection: () => applySelection([]),
  };
};
