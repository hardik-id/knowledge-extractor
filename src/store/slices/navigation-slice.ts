import { stageIndex } from "@/lib/stages";
import type { NavigationSlice, SliceCreator } from "../types";

export const createNavigationSlice: SliceCreator<NavigationSlice> = (set) => ({
  proceededStages: [],
  hasHydrated: false,

  completeStage: (id) =>
    set((s) =>
      s.proceededStages.includes(id) ? s : { proceededStages: [...s.proceededStages, id] },
    ),

  invalidateFrom: (id) =>
    set((s) => ({
      proceededStages: s.proceededStages.filter((stage) => stageIndex(stage) < stageIndex(id)),
    })),
});
