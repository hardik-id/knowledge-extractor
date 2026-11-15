"use client";

import { useShallow } from "zustand/react/shallow";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { StageStatusBadge } from "@/components/pipeline/stage-status-badge";
import { plural } from "@/lib/format";
import type { WorkStageId } from "@/services/contracts";
import { usePipelineStore } from "@/store/pipeline-store";
import { useStageStatus } from "@/store/selectors";

/**
 * The status line under a stage's heading: the stage badge, plus how many
 * files failed or are out of date, since the badge alone can't say which.
 */
export function StageSummary({ stage }: { stage: WorkStageId }) {
  const status = useStageStatus(stage);
  const { failed, stale, firstError } = usePipelineStore(
    useShallow((s) => {
      const cells = s.runFiles.map((file) => s.cells[file.id]?.[stage]);
      return {
        failed: cells.filter((cell) => cell?.status === "failed").length,
        stale: cells.filter((cell) => cell?.status === "stale").length,
        firstError: cells.find((cell) => cell?.status === "failed")?.error?.message,
      };
    }),
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <StageStatusBadge status={status} />
      {failed > 0 && (
        <CellStatusLabel
          status="failed"
          label={`${plural(failed, "file")} failed`}
          title={firstError}
        />
      )}
      {stale > 0 && (
        <CellStatusLabel
          status="stale"
          label={`${plural(stale, "file")} out of date: an earlier stage ran again`}
        />
      )}
    </div>
  );
}
