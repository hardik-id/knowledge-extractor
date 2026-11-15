"use client";

import { CloudDownload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { FileList } from "@/components/pipeline/file-list";
import { StagePanel } from "@/components/pipeline/stage-panel";
import { StageSummary } from "@/features/run/stage-summary";
import { useExecuteStage } from "@/features/run/use-execute-stage";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles, useStageStatus } from "@/store/selectors";
import type { SourceFile } from "@/types/pipeline";

export function IngestPanel() {
  const files = useSelectedFiles();
  const status = useStageStatus("ingest");
  const cells = usePipelineStore((s) => s.cells);
  const startIngestion = useExecuteStage("ingest");

  const running = status === "running";
  const started = status !== "idle";

  const trailing = (file: SourceFile) => {
    const cell = cells[file.id]?.ingest;
    if (cell?.status !== "running") {
      return (
        <CellStatusLabel
          status={cell?.status ?? "pending"}
          label={cell?.status === "succeeded" ? "Downloaded" : undefined}
          title={cell?.error?.message}
        />
      );
    }
    // The backend may not report percentages: without one the bar only shows activity.
    return (
      <div className="flex w-24 flex-col gap-1 sm:w-32">
        <Progress
          value={cell.progress}
          aria-label={`${file.name} download progress`}
          className="[&_[data-slot=progress-indicator]]:bg-link"
        />
        <span className="text-right text-[13px] text-ink-muted tabular-nums">
          {cell.progress === null ? "Downloading" : `${cell.progress}%`}
        </span>
      </div>
    );
  };

  return (
    <StagePanel
      stageId="ingest"
      status={<StageSummary stage="ingest" />}
      actions={
        <Button
          onClick={startIngestion}
          disabled={running || files.length === 0}
          variant={started ? "outline" : "default"}
        >
          {started ? (
            <RotateCcw data-icon="inline-start" />
          ) : (
            <CloudDownload data-icon="inline-start" />
          )}
          {running ? "Downloading…" : started ? "Download again" : "Start ingestion"}
        </Button>
      }
    >
      <FileList label="Files to download" files={files} renderTrailing={trailing} />
    </StagePanel>
  );
}
