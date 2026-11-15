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

/** Vertical flow of connected stage cards, plus the run summary and reset. */
export function StageSidebar({ onNavigate }: StageSidebarProps) {
  const current = useCurrentStage();
  const access = useStageAccessMap(current);
  const stageStatus = useStageStatuses();
  const selectedCount = useSelectedFiles().length;
  const resetRun = usePipelineStore((s) => s.resetRun);

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 pt-2 pb-6">
      <p className="text-[15px] leading-[22px] text-ink-muted">
        <span className="font-semibold text-ink">{plural(selectedCount, "file")}</span> in this run
      </p>

      <nav aria-label="Stages">
        <ol className="flex flex-col">
          {STAGE_ORDER.map((id, i) => (
            <li key={id}>
              <StageNavItem
                meta={STAGE_META[id]}
                access={access[id]}
                runStatus={stageStatus[id]}
                isLast={i === STAGE_ORDER.length - 1}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-auto pt-2">
        <Button variant="ghost" size="sm" onClick={resetRun} className="-ml-3 text-ink-muted">
          <RotateCcw data-icon="inline-start" />
          Start a new run
        </Button>
      </div>
    </div>
  );
}
