import { CircleCheck, CircleDot, CircleX, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewState } from "@/services/contracts";

const REVIEW: Record<ReviewState, { label: string; icon: LucideIcon; className: string }> = {
  suggested: { label: "Suggested", icon: CircleDot, className: "text-ink-muted" },
  accepted: { label: "Accepted", icon: CircleCheck, className: "font-semibold text-success" },
  rejected: { label: "Rejected", icon: CircleX, className: "font-semibold text-danger" },
};

/** A state as a small chip: an icon and a word, never colour alone. */
export function ReviewStateLabel({ state }: { state: ReviewState }) {
  const { label, icon: Icon, className } = REVIEW[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-border-subtle px-1.5 text-caption",
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {label}
    </span>
  );
}

/** "Added by you" or "Edited by you": the person made or changed this. */
export function HumanMarker({ text }: { text: "Added by you" | "Edited by you" }) {
  return (
    <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
      <UserRound aria-hidden className="size-3 shrink-0" />
      {text}
    </span>
  );
}
