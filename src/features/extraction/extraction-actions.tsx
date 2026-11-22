"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublishButton } from "./publish-button";
import type { ExtractionRun } from "./use-extraction-run";

interface ExtractionActionsProps {
  extraction: ExtractionRun;
  /** Writing the definition back to the pipeline only makes sense inside the pipeline. */
  showPublish?: boolean;
}

/** Publish, and Run / Run again. Nothing shows until the definition has loaded. */
export function ExtractionActions({ extraction, showPublish = true }: ExtractionActionsProps) {
  const { definition, running, ranBefore, run } = extraction;
  const { saved } = definition;
  if (!saved) return null;
  return (
    <>
      {showPublish && (
        <PublishButton
          ready={saved.recordTypes.length > 0 && !definition.dirty}
          disabledReason={definition.dirty ? "Save your changes first." : undefined}
          busy={running || definition.saving}
        />
      )}
      <Button
        variant={ranBefore ? "secondary" : "default"}
        size="lg"
        onClick={() => void run()}
        disabled={running || definition.saving}
      >
        {ranBefore && <RotateCcw data-icon="inline-start" />}
        {ranBefore ? "Run again" : "Run extraction"}
      </Button>
    </>
  );
}
