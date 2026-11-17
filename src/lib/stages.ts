import { STAGE_IDS, type StageId } from "@/types/pipeline";

/** Pure helpers for stage order and URLs. No React, no store. */

export const STAGE_ORDER: readonly StageId[] = STAGE_IDS;
export const FIRST_STAGE: StageId = STAGE_ORDER[0];

export function isStageId(value: unknown): value is StageId {
  return typeof value === "string" && (STAGE_ORDER as readonly string[]).includes(value);
}

export function stageIndex(id: StageId): number {
  return STAGE_ORDER.indexOf(id);
}

export function getNextStage(id: StageId): StageId | undefined {
  return STAGE_ORDER[stageIndex(id) + 1];
}

export function getPrevStage(id: StageId): StageId | undefined {
  const i = stageIndex(id);
  return i > 0 ? STAGE_ORDER[i - 1] : undefined;
}

/** Stages that come after `id`. */
export function stagesAfter(id: StageId): StageId[] {
  return STAGE_ORDER.slice(stageIndex(id) + 1);
}

export function stageHref(id: StageId): `/pipeline/${StageId}` {
  return `/pipeline/${id}`;
}
