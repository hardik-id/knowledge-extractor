"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { STAGE_ORDER, stageIndex } from "@/lib/stages";
import type { SourceFile, StageAccess, StageId, StageRunStatus } from "@/types/pipeline";
import { usePipelineStore } from "./pipeline-store";
import { selectStageStatus } from "./run-state";
import type { PipelineState } from "./types";

export { selectStageStatus };

type StageStatuses = Record<StageId, StageRunStatus>;

export function selectStageStatuses(state: PipelineState): StageStatuses {
  return Object.fromEntries(
    STAGE_ORDER.map((id) => [id, selectStageStatus(state, id)]),
  ) as StageStatuses;
}

/** Index of the first stage that isn't done: everything up to it can be opened. */
function frontierIndex(statuses: StageStatuses): number {
  const i = STAGE_ORDER.findIndex((id) => statuses[id] !== "done");
  return i === -1 ? STAGE_ORDER.length - 1 : i;
}

export function canProceedFrom(state: PipelineState, id: StageId): boolean {
  if (id === "select") return state.selectedFiles.length > 0;
  const status = selectStageStatus(state, id);
  return status === "ready" || status === "done";
}

export function useStageStatus(id: StageId): StageRunStatus {
  return usePipelineStore((s) => selectStageStatus(s, id));
}

export function useStageStatuses(): StageStatuses {
  return usePipelineStore(useShallow(selectStageStatuses));
}

/** Sidebar state for every stage, relative to the one on screen. */
export function useStageAccessMap(currentStage: StageId | undefined): Record<StageId, StageAccess> {
  const statuses = useStageStatuses();
  return useMemo(() => {
    const frontier = frontierIndex(statuses);
    return Object.fromEntries(
      STAGE_ORDER.map((id, i) => {
        const access: StageAccess =
          id === currentStage
            ? "current"
            : statuses[id] === "done"
              ? "done"
              : i <= frontier
                ? "available"
                : "locked";
        return [id, access];
      }),
    ) as Record<StageId, StageAccess>;
  }, [statuses, currentStage]);
}

/** The furthest stage the person may open (first stage not yet done). */
export function useFrontierStage(): StageId {
  return usePipelineStore((s) => STAGE_ORDER[frontierIndex(selectStageStatuses(s))]);
}

export function useIsStageLocked(id: StageId): boolean {
  return usePipelineStore((s) => stageIndex(id) > frontierIndex(selectStageStatuses(s)));
}

export function useCanProceed(id: StageId): boolean {
  return usePipelineStore((s) => canProceedFrom(s, id));
}

/**
 * The files of this run: the server's list once a run exists, else the
 * selection. Use the ids of these files to look up cells.
 */
export function useSelectedFiles(): SourceFile[] {
  return usePipelineStore((s) => (s.runFiles.length > 0 ? s.runFiles : s.selectedFiles));
}
