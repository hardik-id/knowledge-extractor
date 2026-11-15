"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FIRST_STAGE, stageHref } from "@/lib/stages";
import { usePipelineStore } from "@/store/pipeline-store";
import { attachRun } from "./attach-run";

/**
 * Connects the store to the run on the server for as long as there is one:
 * after the persisted run id has been read, and again whenever it changes.
 * If the run turns out to be gone, the person goes back to file selection.
 * Renders nothing.
 */
export function RunSync() {
  const router = useRouter();
  const hasHydrated = usePipelineStore((s) => s.hasHydrated);
  const runId = usePipelineStore((s) => s.runId);

  const onRunGone = useEffectEvent(() => {
    toast.error("This run no longer exists", {
      description: "Your files are still selected. Proceed again to start a new run.",
    });
    router.replace(stageHref(FIRST_STAGE));
  });

  useEffect(() => {
    if (!hasHydrated || !runId) return;
    return attachRun(runId, { onGone: () => onRunGone() });
  }, [hasHydrated, runId]);

  return null;
}
