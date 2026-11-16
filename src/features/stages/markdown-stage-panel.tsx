"use client";

import { FileCode, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { EmptyState } from "@/components/pipeline/empty-state";
import { MarkdownViewer } from "@/components/pipeline/markdown-viewer";
import { SplitView } from "@/components/pipeline/split-view";
import { StagePanel } from "@/components/pipeline/stage-panel";
import { StageSummary } from "@/features/run/stage-summary";
import { useExecuteStage } from "@/features/run/use-execute-stage";
import { useStageOutput } from "@/features/run/use-stage-output";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarkdownStageId, StageCell } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles, useStageStatus } from "@/store/selectors";
import { STAGE_META } from "./config";

export interface MarkdownStageWording {
  /** Empty state title while the stage is running. */
  runningTitle: string;
  /** Empty state title before the stage has run. */
  idleTitle: string;
  /** Empty state description, given the number of selected files. */
  description: (fileCount: number) => string;
  runLabel: string;
  runningLabel: string;
  runAgainLabel: string;
  /** Per-file status word while a file is being worked on, e.g. "Converting". */
  fileRunningLabel: string;
  /** Shown when no file can be opened. */
  noneToShow: string;
}

interface MarkdownStagePanelProps extends MarkdownStageWording {
  stageId: MarkdownStageId;
}

/** The list of Markdown files and the rendered document, shared by every Markdown stage. */
export function MarkdownStagePanel({
  stageId,
  runningTitle,
  idleTitle,
  description,
  runLabel,
  runningLabel,
  runAgainLabel,
  fileRunningLabel,
  noneToShow,
}: MarkdownStagePanelProps) {
  const files = useSelectedFiles();
  const status = useStageStatus(stageId);
  const cells = usePipelineStore((s) => s.cells);
  const activeDocId = usePipelineStore((s) => s.activeDocId);
  const setActiveDoc = usePipelineStore((s) => s.setActiveDoc);
  const convert = useExecuteStage(stageId);

  const running = status === "running";
  // Every file this stage has touched. Only those with output can be opened.
  const rows = files.flatMap((file) => {
    const cell = cells[file.id]?.[stageId];
    return cell && cell.status !== "pending" ? [{ file, cell }] : [];
  });
  const active =
    rows.find((row) => row.file.id === activeDocId && row.cell.output) ??
    rows.find((row) => row.cell.output);

  return (
    <StagePanel
      stageId={stageId}
      status={<StageSummary stage={stageId} />}
      actions={
        rows.length > 0 && (
          <Button variant="outline" onClick={convert} disabled={running}>
            <RotateCcw data-icon="inline-start" />
            {runAgainLabel}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={STAGE_META[stageId].icon}
          title={running ? runningTitle : idleTitle}
          description={description(files.length)}
          action={
            <Button onClick={convert} disabled={running}>
              {running ? runningLabel : runLabel}
            </Button>
          }
        />
      ) : (
        <SplitView
          listLabel="Markdown files"
          list={
            <ul className="flex flex-col gap-1 p-2">
              {rows.map(({ file, cell }) => {
                const selected = active?.file.id === file.id;
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setActiveDoc(file.id)}
                      disabled={!cell.output}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                        selected
                          ? "bg-surface-raised shadow-card"
                          : "enabled:hover:bg-surface-raised/60",
                      )}
                    >
                      <FileCode aria-hidden className="size-5 shrink-0 text-link" />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[14px] leading-5 font-medium text-ink">
                          {cell.output?.name ?? file.name}
                        </span>
                        {cell.output && (
                          <span className="block truncate text-[13px] leading-[18px] text-ink-muted">
                            from {file.name}
                          </span>
                        )}
                        {cell.status !== "succeeded" && (
                          <CellStatusLabel
                            status={cell.status}
                            label={cell.status === "running" ? fileRunningLabel : undefined}
                            title={cell.error?.message}
                          />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          }
          detail={
            active?.cell.output ? (
              <MarkdownDocument stageId={stageId} fileId={active.file.id} cell={active.cell} />
            ) : (
              <p className="px-6 py-6 text-ink-muted">{running ? runningLabel : noneToShow}</p>
            )
          }
        />
      )}
    </StagePanel>
  );
}

/** One file. Its text is fetched when it is opened, not kept in the store. */
function MarkdownDocument({
  stageId,
  fileId,
  cell,
}: {
  stageId: MarkdownStageId;
  fileId: string;
  cell: StageCell;
}) {
  const { data, error, isLoading, retry } = useStageOutput(fileId, stageId);
  // Enrichment updates the classified file in place, so after it ran the classify
  // view already shows the enriched text.
  const enrichCell = usePipelineStore((s) => s.cells[fileId]?.enrich);
  const includesEnrichment =
    stageId === "classify" &&
    enrichCell?.status === "succeeded" &&
    Date.parse(enrichCell.updatedAt) > Date.parse(cell.updatedAt);
  // The size of the text on screen: the cell's own size is from before a later
  // stage updated the shared file.
  const sizeBytes = data ? new TextEncoder().encode(data.text).length : cell.output?.sizeBytes;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-raised px-6 py-3">
        <span className="font-mono text-[14px] font-medium text-ink">{cell.output?.name}</span>
        <span className="flex items-center gap-3 text-[13px] text-ink-muted tabular-nums">
          {cell.status === "stale" && <CellStatusLabel status="stale" />}
          {includesEnrichment && <span>Includes enrichment</span>}
          {sizeBytes !== undefined && formatBytes(sizeBytes)}
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-3 px-6 py-6">
          <p>
            <span className="font-semibold text-ink">Couldn&apos;t load this file.</span>{" "}
            {describeApiError(error)}
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <div aria-busy="true" aria-label="Loading Markdown" className="space-y-3 px-6 py-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <MarkdownViewer markdown={data.text} className="px-6 py-6" />
      )}
    </div>
  );
}
