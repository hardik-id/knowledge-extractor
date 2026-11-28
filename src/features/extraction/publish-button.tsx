"use client";

import { Rocket } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastFailure } from "@/features/auth/report-failure";
import { plural } from "@/lib/format";
import { services } from "@/services";
import { usePipelineStore } from "@/store/pipeline-store";

/** "Publish to pipeline" with an inline confirmation underneath. */
export function PublishButton({
  ready,
  disabledReason,
  busy,
}: {
  /** There is a saved definition with a record type and nothing unsaved. */
  ready: boolean;
  /** Why it can't be used yet, shown as the button's title. */
  disabledReason?: string;
  busy?: boolean;
}) {
  const runId = usePipelineStore((s) => s.runId);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const id = useId();

  const publish = async () => {
    if (!runId) return;
    setPublishing(true);
    try {
      const result = await services.extraction.publishDefinition(runId);
      toast.success("Published to the pipeline", {
        description: `Version ${result.pipelineConfigVersion} · ${plural(result.examples, "example")}`,
      });
      setConfirming(false);
    } catch (error) {
      toastFailure("Couldn't publish", error);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        disabled={!ready || busy || !runId}
        title={disabledReason}
        aria-expanded={confirming}
        aria-controls={id}
        onClick={() => setConfirming((c) => !c)}
      >
        <Rocket data-icon="inline-start" aria-hidden />
        Publish to pipeline
      </Button>
      {confirming && (
        <div
          id={id}
          role="group"
          aria-label="Publish to pipeline"
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2.5rem)] space-y-3 rounded-panel border border-border-subtle bg-surface-raised p-4 shadow-float"
        >
          <p className="text-body text-ink">
            This saves the definition to the pipeline&apos;s extraction settings. Every document the
            pipeline loads will be extracted this way.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={publishing}
              onClick={() => void publish()}
            >
              Publish
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              autoFocus
              disabled={publishing}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
