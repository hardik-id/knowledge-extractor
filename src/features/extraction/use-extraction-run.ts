"use client";

import { useState } from "react";
import { toast } from "sonner";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useCanProceed, useStageStatus } from "@/store/selectors";
import { useExtractionDefinition } from "./use-extraction-definition";

export type ExtractionTab = "define" | "review" | "output";

/** The definition, the open tab and the Run action, shared by the actions and the workspace. */
export function useExtractionRun() {
  const definition = useExtractionDefinition();
  const status = useStageStatus("extract");
  const canProceed = useCanProceed("extract");
  const executeStage = usePipelineStore((s) => s.executeStage);
  const hasOutput = usePipelineStore((s) => Object.values(s.cells).some((c) => c.extract?.output));
  const [chosen, setChosen] = useState<ExtractionTab | null>(null);
  const tab: ExtractionTab = chosen ?? (hasOutput ? "review" : "define");

  const running = status === "running";
  const ranBefore = hasOutput || canProceed;

  const run = async () => {
    const { saved, draft } = definition;
    if (!saved || !draft) return;
    if (!definition.valid) {
      definition.revealErrors();
      setChosen("define");
      toast.error("Fix the definition first", {
        description: "Some fields on the Define tab need attention.",
      });
      return;
    }
    const current = definition.dirty ? await definition.save() : saved;
    if (!current) return;
    try {
      await executeStage("extract", { config: { definitionVersion: current.version } });
      setChosen("review");
    } catch (error) {
      toast.error("Couldn't start extraction", { description: describeApiError(error) });
    }
  };

  return { definition, tab, setTab: setChosen, running, ranBefore, run };
}

export type ExtractionRun = ReturnType<typeof useExtractionRun>;
