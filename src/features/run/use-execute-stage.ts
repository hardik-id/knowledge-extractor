"use client";

import { toast } from "sonner";
import { STAGE_META } from "@/features/stages/config";
import type { WorkStageId } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";

/**
 * The click handler for a stage's run button. It asks the server to start the
 * stage; progress then shows up through the store. A refusal is shown as a toast.
 */
export function useExecuteStage(stage: WorkStageId): () => void {
  const executeStage = usePipelineStore((s) => s.executeStage);
  return () => {
    executeStage(stage).catch((error: unknown) => {
      toast.error(`Couldn't start ${STAGE_META[stage].label.toLowerCase()}`, {
        description: describeApiError(error),
      });
    });
  };
}
