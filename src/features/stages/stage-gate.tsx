"use client";

import Link from "next/link";
import { CloudOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { stageHref } from "@/lib/stages";
import { usePipelineStore } from "@/store/pipeline-store";
import { useFrontierStage, useIsStageLocked } from "@/store/selectors";
import type { StageId } from "@/types/pipeline";
import { STAGE_META } from "./config";

/**
 * Renders a stage only when it may be opened. Waits for the persisted run to
 * be read, and for its state to arrive from the server, so a refresh on
 * /pipeline/transform doesn't flash "locked".
 */
export function StageGate({ stageId, children }: { stageId: StageId; children: React.ReactNode }) {
  const hasHydrated = usePipelineStore((s) => s.hasHydrated);
  // Without a run there is nothing to wait for.
  const runLoad = usePipelineStore((s) => (s.runId ? s.runLoad : "ready"));
  const loadRun = usePipelineStore((s) => s.loadRun);
  const locked = useIsStageLocked(stageId);
  const frontier = useFrontierStage();

  if (!hasHydrated || runLoad === "idle" || runLoad === "loading") return <StagePanelSkeleton />;

  if (runLoad === "error") {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={CloudOff}
          title="Couldn't load this run"
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

  if (locked) {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={Lock}
          title={`${STAGE_META[stageId].label} isn't available yet`}
          description={`Finish ${STAGE_META[frontier].label.toLowerCase()} first. Each stage works on the output of the one before it.`}
          action={
            <Button asChild>
              <Link href={stageHref(frontier)}>
                Go to {STAGE_META[frontier].label.toLowerCase()}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return children;
}

export function StagePanelSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading stage"
      className="space-y-6 px-5 py-6 sm:px-8"
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
