"use client";

import { StagePanel } from "@/components/pipeline/stage-panel";
import { ExtractionActions } from "@/features/extraction/extraction-actions";
import { ExtractionWorkspace } from "@/features/extraction/extraction-workspace";
import { useExtractionRun } from "@/features/extraction/use-extraction-run";
import { StageSummary } from "@/features/run/stage-summary";

const DEFINITION_NOTE =
  "This definition starts from the pipeline's extraction settings and applies to this run only.";

export function ExtractPanel() {
  const extraction = useExtractionRun();
  return (
    <StagePanel
      stageId="extract"
      status={<StageSummary stage="extract" />}
      actions={<ExtractionActions extraction={extraction} />}
    >
      <ExtractionWorkspace extraction={extraction} definitionNote={DEFINITION_NOTE} />
    </StagePanel>
  );
}
