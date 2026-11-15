"use client";

import { FileCode, FileText, RotateCcw } from "lucide-react";
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
import type { StageCell } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useSelectedFiles, useStageStatus } from "@/store/selectors";

export function TransformPanel() {
  const files = useSelectedFiles();
  const status = useStageStatus("transform");
  const cells = usePipelineStore((s) => s.cells);
  const activeDocId = usePipelineStore((s) => s.activeDocId);
  const setActiveDoc = usePipelineStore((s) => s.setActiveDoc);
  const convert = useExecuteStage("transform");

  const running = status === "running";
  // Every file this stage has touched. Only those with output can be opened.
  const rows = files.flatMap((file) => {
    const cell = cells[file.id]?.transform;
    return cell && cell.status !== "pending" ? [{ file, cell }] : [];
  });
  const active =
    rows.find((row) => row.file.id === activeDocId && row.cell.output) ??
    rows.find((row) => row.cell.output);

  return (
    <StagePanel
      stageId="transform"
      status={<StageSummary stage="transform" />}
      actions={
        rows.length > 0 && (
          <Button variant="outline" onClick={convert} disabled={running}>
            <RotateCcw data-icon="inline-start" />
            Convert again
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={running ? "Converting files…" : "No Markdown files yet"}
          description={`Convert the ${files.length} downloaded files to Markdown to review them here.`}
          action={
            <Button onClick={convert} disabled={running}>
              {running ? "Converting…" : "Convert to Markdown"}
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
                            label={cell.status === "running" ? "Converting" : undefined}
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
              <MarkdownDocument fileId={active.file.id} cell={active.cell} />
            ) : (
              <p className="px-6 py-6 text-ink-muted">
                {running ? "Converting…" : "No Markdown to show. Convert the files again."}
              </p>
            )
          }
        />
      )}
    </StagePanel>
  );
}

/** One converted file. Its text is fetched when it is opened, not kept in the store. */
function MarkdownDocument({ fileId, cell }: { fileId: string; cell: StageCell }) {
  const { data, error, isLoading, retry } = useStageOutput(fileId, "transform");

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-raised px-6 py-3">
        <span className="font-mono text-[14px] font-medium text-ink">{cell.output?.name}</span>
        <span className="flex items-center gap-3 text-[13px] text-ink-muted tabular-nums">
          {cell.status === "stale" && <CellStatusLabel status="stale" />}
          {cell.output && formatBytes(cell.output.sizeBytes)}
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
