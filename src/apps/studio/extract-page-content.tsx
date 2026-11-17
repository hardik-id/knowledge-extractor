"use client";

import Link from "next/link";
import { ArrowLeft, CloudOff, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { ExtractionActions } from "@/features/extraction/extraction-actions";
import { ExtractionWorkspace } from "@/features/extraction/extraction-workspace";
import { useExtractionRun } from "@/features/extraction/use-extraction-run";
import { StageSummary } from "@/features/run/stage-summary";
import { usePipelineStore } from "@/store/pipeline-store";
import { StudioPanel } from "./studio-panel";

/** Waits for the stored run to be read and loaded, then shows the workspace. */
export function ExtractPageContent() {
  const hasHydrated = usePipelineStore((s) => s.hasHydrated);
  const hasRun = usePipelineStore((s) => s.runId !== null);
  const runLoad = usePipelineStore((s) => (s.runId ? s.runLoad : "ready"));
  const loadRun = usePipelineStore((s) => s.loadRun);

  if (!hasHydrated || runLoad === "idle" || runLoad === "loading") return <ExtractSkeleton />;

  if (!hasRun) {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={FileSearch}
          title="No documents opened yet"
          description="Choose the documents you want to extract from first."
          action={
            <Button asChild>
              <Link href="/studio">Go to documents</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (runLoad === "error") {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={CloudOff}
          title="Couldn't load this workspace"
          description="The server didn't answer. Check your connection and try again."
          action={
            <Button variant="outline" onClick={() => void loadRun()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return <ExtractPanel />;
}

function ExtractPanel() {
  const extraction = useExtractionRun();
  return (
    <StudioPanel
      id="studio-extract"
      title="Knowledge extraction"
      description="Say what to extract, run it, then review and label what it found."
      status={
        <div className="space-y-2">
          <StageSummary stage="extract" />
          <Button variant="link" size="sm" asChild className="h-auto px-0">
            <Link href="/studio">
              <ArrowLeft data-icon="inline-start" />
              Change documents
            </Link>
          </Button>
        </div>
      }
      actions={<ExtractionActions extraction={extraction} showPublish={false} />}
    >
      <ExtractionWorkspace
        extraction={extraction}
        definitionNote="This definition applies to this workspace only."
      />
    </StudioPanel>
  );
}

function ExtractSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading extraction" className="space-y-6 px-5 py-6 sm:px-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
