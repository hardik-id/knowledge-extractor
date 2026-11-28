"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePipelineStore, useRunStoreApi } from "@/store/pipeline-store";
import { attachRun } from "./attach-run";

/**
 * Connects the store to the run on the server for as long as there is one:
 * after the persisted run id has been read, and again whenever it changes.
 * If the run turns out to be gone, the person goes back to `firstHref`.
 * Without one (a workspace's run), the store's own state says so instead.
 * Renders nothing.
 */
export function RunSync({ firstHref }: { firstHref?: string }) {
  const store = useRunStoreApi();
  const router = useRouter();
  const hasHydrated = usePipelineStore((s) => s.hasHydrated);
  const runId = usePipelineStore((s) => s.runId);

  const onRunGone = useEffectEvent(() => {
    if (!firstHref) return;
    toast.error("This run no longer exists", {
      description: "Your files are still selected. Proceed again to start a new run.",
    });
    router.replace(firstHref);
  });

  useEffect(() => {
    if (!hasHydrated || !runId) return;
    return attachRun(store, runId, { onGone: () => onRunGone() });
  }, [store, hasHydrated, runId]);

  return null;
}
