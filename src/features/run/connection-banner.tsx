"use client";

import { WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePipelineStore } from "@/store/pipeline-store";

/**
 * Shown above the stage while live updates aren't arriving, so nobody waits on
 * progress that has stopped moving. It goes away by itself once the connection
 * is back and the state has been fetched again.
 */
export function ConnectionBanner() {
  const connection = usePipelineStore((s) => (s.runId ? s.connection : "idle"));
  if (connection !== "reconnecting" && connection !== "closed") return null;

  return (
    <Alert variant="warning" role="status" className="mb-4 shrink-0">
      <WifiOff aria-hidden />
      <AlertTitle>Live updates are paused</AlertTitle>
      <AlertDescription>
        {connection === "reconnecting"
          ? "Reconnecting. Work carries on in the background, and this page catches up by itself."
          : "The connection to this run was closed. Reload the page to see the latest state."}
      </AlertDescription>
    </Alert>
  );
}
