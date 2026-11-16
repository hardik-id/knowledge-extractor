"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StagePanel } from "@/components/pipeline/stage-panel";
import { StageSummary } from "@/features/run/stage-summary";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useCanProceed, useStageStatus } from "@/store/selectors";
import { PublishButton } from "./publish-button";
import { DefineTab } from "./define-tab";
import { OutputTab } from "./output-tab";
import { ReviewTab } from "./review-tab";
import { useExtractionDefinition } from "./use-extraction-definition";

type TabId = "define" | "review" | "output";

export function ExtractPanel() {
  const definition = useExtractionDefinition();
  const status = useStageStatus("extract");
  const canProceed = useCanProceed("extract");
  const executeStage = usePipelineStore((s) => s.executeStage);
  const hasOutput = usePipelineStore((s) => Object.values(s.cells).some((c) => c.extract?.output));
  const [chosen, setChosen] = useState<TabId | null>(null);
  const tab: TabId = chosen ?? (hasOutput ? "review" : "define");

  const running = status === "running";
  const ranBefore = hasOutput || canProceed;
  const { saved, draft } = definition;

  const run = async () => {
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

  return (
    <StagePanel
      stageId="extract"
      status={<StageSummary stage="extract" />}
      actions={
        saved && (
          <>
            <PublishButton
              ready={saved.recordTypes.length > 0 && !definition.dirty}
              disabledReason={definition.dirty ? "Save your changes first." : undefined}
              busy={running || definition.saving}
            />
            <Button
              variant={ranBefore ? "outline" : "default"}
              onClick={() => void run()}
              disabled={running || definition.saving}
            >
              {ranBefore && <RotateCcw data-icon="inline-start" />}
              {ranBefore ? "Run again" : "Run extraction"}
            </Button>
          </>
        )
      }
    >
      {definition.error ? (
        <div className="flex flex-col items-start gap-3">
          <p>
            <span className="font-semibold text-ink">Couldn&apos;t load the definition.</span>{" "}
            {describeApiError(definition.error)}
          </p>
          <Button variant="outline" size="sm" onClick={definition.retry}>
            Try again
          </Button>
        </div>
      ) : definition.isLoading || !saved ? (
        <div aria-busy="true" aria-label="Loading definition" className="space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setChosen(v as TabId)} className="gap-5">
          <TabsList variant="line" aria-label="Extraction">
            <TabsTrigger value="define">Define</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
          </TabsList>
          <TabsContent value="define">
            <DefineTab definition={definition} />
          </TabsContent>
          <TabsContent value="review">
            <ReviewTab definition={saved} />
          </TabsContent>
          <TabsContent value="output">
            <OutputTab definition={saved} />
          </TabsContent>
        </Tabs>
      )}
    </StagePanel>
  );
}
