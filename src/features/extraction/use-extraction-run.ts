"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastFailure } from "@/features/auth/report-failure";
import type { ExtractionNoun } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useCanProceed, useStageStatus } from "@/store/selectors";
import {
  useExtractionDefinition,
  type ExtractionDefinitionState,
} from "./use-extraction-definition";

export type ExtractionTab = "define" | "review" | "output";

export interface RunOptions {
  /** Run on these documents only. Default: every document of the run. */
  fileIds?: string[];
}

export interface ExtractionRun {
  noun: ExtractionNoun;
  definition: ExtractionDefinitionState;
  tab: ExtractionTab;
  /** Absent where there are no tabs to switch. */
  setTab?: (tab: ExtractionTab) => void;
  running: boolean;
  ranBefore: boolean;
  /** Saves unsaved changes first, then starts the extraction. */
  run: (options?: RunOptions) => Promise<void>;
}

/** The definition, the open tab and the Run action, shared by the actions and the workspace. */
export function useExtractionRun(noun: ExtractionNoun = "definition"): ExtractionRun {
  const definition = useExtractionDefinition(noun);
  const status = useStageStatus("extract");
  const canProceed = useCanProceed("extract");
  const executeStage = usePipelineStore((s) => s.executeStage);
  const hasOutput = usePipelineStore((s) => Object.values(s.cells).some((c) => c.extract?.output));
  const [chosen, setChosen] = useState<ExtractionTab | null>(null);
  const tab: ExtractionTab = chosen ?? (hasOutput ? "review" : "define");

  const running = status === "running";
  const ranBefore = hasOutput || canProceed;

  const run = async (options?: RunOptions) => {
    const { saved, draft } = definition;
    if (!saved || !draft) return;
    if (!definition.valid) {
      definition.revealErrors();
      setChosen("define");
      toast.error(`Fix the ${noun} first`, {
        description: "Some fields on the Define tab need attention.",
      });
      return;
    }
    const current = definition.dirty ? await definition.save() : saved;
    if (!current) return;
    try {
      await executeStage("extract", {
        config: { definitionVersion: current.version },
        ...(options?.fileIds && { fileIds: options.fileIds }),
      });
      setChosen("review");
    } catch (error) {
      toastFailure("Couldn't start extraction", error, noun);
    }
  };

  return { noun, definition, tab, setTab: setChosen, running, ranBefore, run };
}
