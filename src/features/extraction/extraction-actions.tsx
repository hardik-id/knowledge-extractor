"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublishButton } from "./publish-button";
import { TemplatesEntry } from "./template-dialog";
import { VersionBar } from "./version-history";
import { SaveConfigurationButton } from "./save-configuration-button";
import type { ExtractionRun } from "./use-extraction-run";

interface ExtractionActionsProps {
  extraction: ExtractionRun;
  /** Writing the definition back to the pipeline only makes sense inside the pipeline. */
  showPublish?: boolean;
  /** "Save configuration": saves the draft as a new version, with a note. */
  showSave?: boolean;
}

/**
 * The facts of a versioned configuration for the page header: "Version 4, saved 20 November ·
 * Unsaved changes", then "Version history" and "Templates" as quiet links.
 */
export function ExtractionFacts({ extraction }: { extraction: ExtractionRun }) {
  const { definition } = extraction;
  if (!definition.saved) return null;
  return (
    <>
      <VersionBar definition={definition} />
      <TemplatesEntry definition={definition} />
    </>
  );
}

/** Publish or Save configuration, and Run / Run again. Nothing shows until the definition has loaded. */
export function ExtractionActions({
  extraction,
  showPublish = true,
  showSave = false,
}: ExtractionActionsProps) {
  const { definition, running, ranBefore, run } = extraction;
  const { saved } = definition;
  if (!saved) return null;
  return (
    <>
      {showSave && <SaveConfigurationButton extraction={extraction} />}
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
