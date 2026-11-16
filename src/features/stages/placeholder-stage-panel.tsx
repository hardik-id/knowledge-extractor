"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/pipeline/empty-state";
import { StagePanel } from "@/components/pipeline/stage-panel";
import { StageSummary } from "@/features/run/stage-summary";
import { useExecuteStage } from "@/features/run/use-execute-stage";
import { plural } from "@/lib/format";
import type { WorkStageId } from "@/services/contracts";
import { useSelectedFiles, useStageStatus } from "@/store/selectors";
import { STAGE_META } from "./config";

interface PlaceholderStagePanelProps {
  stageId: WorkStageId;
  /** What this stage will show once built; replaces the default empty state text. */
  comingSoon: string;
}

/**
 * Shared skeleton for stages without real UI yet (now only index).
 * Runs the stage on the backend so the proceed flow works end to end.
 */
export function PlaceholderStagePanel({ stageId, comingSoon }: PlaceholderStagePanelProps) {
  const meta = STAGE_META[stageId];
  const status = useStageStatus(stageId);
  const fileCount = useSelectedFiles().length;
  const run = useExecuteStage(stageId);
  const running = status === "running";
  const finished = status === "ready" || status === "done";

  return (
    <StagePanel stageId={stageId} status={<StageSummary stage={stageId} />}>
      <EmptyState
        icon={meta.icon}
        title={
          finished
            ? `${meta.label} finished for ${plural(fileCount, "file")}`
            : `${meta.actionLabel} on ${plural(fileCount, "file")}`
        }
        description={comingSoon}
        action={
          <Button onClick={run} disabled={running} variant={finished ? "outline" : "default"}>
            {running ? "Running…" : finished || status === "error" ? "Run again" : meta.actionLabel}
          </Button>
        }
      />
    </StagePanel>
  );
}
