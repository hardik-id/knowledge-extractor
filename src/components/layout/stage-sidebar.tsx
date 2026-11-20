"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_META } from "@/features/stages/config";
import { plural } from "@/lib/format";
import { STAGE_ORDER } from "@/lib/stages";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles, useStageAccessMap, useStageStatuses } from "@/store/selectors";
import { StageNavItem } from "./stage-nav-item";
import { useCurrentStage } from "./use-current-stage";

interface StageSidebarProps {
  /** Called after a stage link is followed (the mobile sheet closes itself). */
  onNavigate?: () => void;
}

/** The stages as rows, plus the run summary and reset. */
export function StageSidebar({ onNavigate }: StageSidebarProps) {
  const current = useCurrentStage();
  const access = useStageAccessMap(current);
  const stageStatus = useStageStatuses();
  const selectedCount = useSelectedFiles().length;
  const resetRun = usePipelineStore((s) => s.resetRun);

  return (
    <div className="flex min-h-full flex-col gap-3 px-3 pt-1 pb-3">
      <p className="px-2 text-small text-ink-muted">
        <span className="font-semibold text-ink">{plural(selectedCount, "file")}</span> in this run
      </p>

      <nav aria-label="Stages">
        <ol className="flex flex-col gap-0.5">
          {STAGE_ORDER.map((id) => (
            <li key={id}>
              <StageNavItem
                meta={STAGE_META[id]}
                access={access[id]}
                runStatus={stageStatus[id]}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-auto pt-2">
        <Button variant="ghost" size="sm" onClick={resetRun} className="text-ink-muted">
          <RotateCcw data-icon="inline-start" />
          Start a new run
        </Button>
      </div>
    </div>
  );
}
