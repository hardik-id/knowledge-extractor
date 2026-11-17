"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { STAGE_META } from "@/features/stages/config";
import { getNextStage, getPrevStage, stageHref } from "@/lib/stages";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { useCanProceed } from "@/store/selectors";
import type { StageId } from "@/types/pipeline";

/** Sticky footer: Back link + "Proceed to <next stage>" (or "Finish run" on the last stage). */
export function StageFooter({ stageId }: { stageId: StageId }) {
  const router = useRouter();
  const canProceed = useCanProceed(stageId);
  const completeStage = usePipelineStore((s) => s.completeStage);
  const ensureRun = usePipelineStore((s) => s.ensureRun);
  // Leaving file selection is what creates the run on the server.
  const startingRun = usePipelineStore((s) => stageId === "select" && s.creatingRun);
  const prev = getPrevStage(stageId);
  const next = getNextStage(stageId);

  const proceed = async () => {
    if (stageId === "select") {
      try {
        await ensureRun();
      } catch (error) {
        toast.error("Couldn't start the run", { description: describeApiError(error) });
        return;
      }
    }
    completeStage(stageId);
    if (next) {
      router.push(stageHref(next));
    } else {
      toast.success("Run complete", { description: "All documents are indexed and searchable." });
    }
  };

  const hintId = `proceed-hint-${stageId}`;

  return (
    <footer className="sticky bottom-0 z-10 shrink-0 rounded-b-xl border-t border-border-subtle bg-surface-raised pb-[env(safe-area-inset-bottom)] md:static md:pb-0">
      <div className="flex flex-col-reverse gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {prev ? (
          <Button variant="ghost" asChild className="text-link">
            <Link href={stageHref(prev)}>
              <ArrowLeft data-icon="inline-start" />
              Back to {STAGE_META[prev].label.toLowerCase()}
            </Link>
          </Button>
        ) : (
          <span />
        )}

        <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-4">
          {!canProceed && (
            <p id={hintId} className="text-[13px] leading-[18px] text-ink-muted sm:text-right">
              {stageId === "select"
                ? `Select at least one file to continue.`
                : `${STAGE_META[stageId].actionLabel} to continue.`}
            </p>
          )}
          <Button
            onClick={() => void proceed()}
            disabled={!canProceed || startingRun}
            aria-describedby={!canProceed ? hintId : undefined}
          >
            {startingRun ? (
              <>
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
                Starting run…
              </>
            ) : next ? (
              <>
                Proceed to {STAGE_META[next].label.toLowerCase()}
                <ArrowRight data-icon="inline-end" />
              </>
            ) : (
              <>
                <Check data-icon="inline-start" />
                Finish run
              </>
            )}
          </Button>
        </div>
      </div>
    </footer>
  );
}
