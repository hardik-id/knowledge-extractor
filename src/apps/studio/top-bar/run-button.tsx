"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { useRunExtractions } from "@/features/extraction/use-run-extractions";
import { usePipelineStore } from "@/store/pipeline-store";
import { planRun, type RunChoice } from "./run-plan";

/**
 * The one Run button of the top bar. It says what will happen (see `planRun`): run on the open
 * document, on all of them, or again. When there is another way to run, a menu next to it offers
 * it. A run saves unsaved changes first.
 */
export function RunButton({ extraction }: { extraction: ExtractionRun }) {
  const { definition, running, run } = extraction;
  const runFiles = usePipelineStore((s) => s.runFiles);
  const activeDocId = usePipelineStore((s) => s.activeDocId);
  const cells = usePipelineStore((s) => s.cells);
  const { extractions, error, isLoading } = useRunExtractions();
  const { saved, draft, dirty, saving } = definition;

  const plan = useMemo(() => {
    const versions: Record<string, number | undefined> = {};
    // While loading, `extractions` can belong to an earlier key: its versions would be stale.
    if (!isLoading) for (const e of extractions ?? []) versions[e.fileId] = e.definitionVersion;
    return planRun({
      fileIds: runFiles.map((f) => f.id),
      activeId: activeDocId,
      cells: Object.fromEntries(runFiles.map((f) => [f.id, cells[f.id]?.extract])),
      versions,
      versionsFailed: !isLoading && !!error,
      savedVersion: saved?.version ?? 0,
      dirty,
      empty: (draft?.recordTypes.length ?? 0) === 0,
      running: running || saving,
    });
  }, [
    runFiles,
    activeDocId,
    cells,
    extractions,
    error,
    isLoading,
    saved,
    draft,
    dirty,
    saving,
    running,
  ]);

  if (!saved) return null;
  const start = (choice: RunChoice) => void run(choice.fileIds ? { fileIds: choice.fileIds } : {});
  const showMenu = !!plan.alternative && !plan.disabled;

  return (
    <div role="group" aria-label="Run" className="flex items-center">
      <Button
        variant={plan.primary ? "default" : "secondary"}
        size="lg"
        disabled={plan.disabled}
        className={showMenu ? "rounded-r-none" : undefined}
        onClick={() => start(plan.main)}
      >
        {plan.main.label === "Run again" && <RotateCcw data-icon="inline-start" aria-hidden />}
        {plan.main.label}
      </Button>
      {showMenu && plan.alternative && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="icon-lg"
              aria-label="Other ways to run"
              className="rounded-l-none border-l border-l-primary-foreground/40"
            >
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem onSelect={() => start(plan.alternative!)}>
              {plan.alternative.label}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
