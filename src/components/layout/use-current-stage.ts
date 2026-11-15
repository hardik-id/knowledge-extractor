"use client";

import { useParams } from "next/navigation";
import { isStageId } from "@/lib/stages";
import type { StageId } from "@/types/pipeline";

/** The stage in the URL (/pipeline/[stage]), or undefined off a stage route. */
export function useCurrentStage(): StageId | undefined {
  const { stage } = useParams<{ stage?: string }>();
  return isStageId(stage) ? stage : undefined;
}
