import Link from "next/link";
import { cn } from "@/lib/utils";
import { stageHref } from "@/lib/stages";
import type { StageMeta } from "@/features/stages/config";
import type { StageAccess, StageRunStatus } from "@/types/pipeline";
import { StageStatusBadge } from "@/components/pipeline/stage-status-badge";

interface StageNavItemProps {
  meta: StageMeta;
  access: StageAccess;
  runStatus: StageRunStatus;
  /** The last stage has no connector below it. */
  isLast: boolean;
  onNavigate?: () => void;
}

/**
 * One block in the stage flow: a card with a centred label and status,
 * joined to the next card by a short connector that lights up once this stage is done.
 * Current = glowing brand-blue border; locked = dashed and not a link.
 */
export function StageNavItem({ meta, access, runStatus, isLast, onNavigate }: StageNavItemProps) {
  const isCurrent = access === "current";
  const isLocked = access === "locked";
  const isDone = runStatus === "done";

  const content = (
    <>
      <span className="max-w-full truncate text-[17px] leading-6 font-semibold">{meta.label}</span>
      <StageStatusBadge status={isLocked ? "locked" : runStatus} variant="inline" />
    </>
  );

  const card =
    "flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-4 py-3 text-center transition-[background-color,border-color,box-shadow]";

  return (
    <>
      {isLocked ? (
        <div
          aria-disabled="true"
          title={`Finish the earlier stages to open ${meta.label}`}
          className={cn(
            card,
            "cursor-not-allowed border-dashed border-border-subtle text-ink-muted",
          )}
        >
          {content}
        </div>
      ) : (
        <Link
          href={stageHref(meta.id)}
          onClick={onNavigate}
          aria-current={isCurrent ? "step" : undefined}
          className={cn(
            card,
            "bg-surface-raised",
            isCurrent
              ? "border-brand-blue text-ink-heading shadow-[0_0_16px_color-mix(in_srgb,var(--brand-blue)_45%,transparent)]"
              : isDone
                ? "border-link/60 text-ink hover:border-link hover:shadow-card"
                : "border-border-subtle text-ink hover:border-border-control hover:shadow-card",
          )}
        >
          {content}
        </Link>
      )}
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            "mx-auto block h-4 w-0.5",
            isDone ? "bg-link" : "bg-border-control opacity-60",
          )}
        />
      )}
    </>
  );
}
