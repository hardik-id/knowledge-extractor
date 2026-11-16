import { CircleCheck, CircleDot, CircleX, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewState } from "@/services/contracts";

const REVIEW: Record<ReviewState, { label: string; icon: LucideIcon; className: string }> = {
  suggested: { label: "Suggested", icon: CircleDot, className: "text-ink-muted" },
  accepted: { label: "Accepted", icon: CircleCheck, className: "font-semibold text-success" },
  rejected: { label: "Rejected", icon: CircleX, className: "font-semibold text-danger" },
};

export function ReviewStateLabel({ state }: { state: ReviewState }) {
  const { label, icon: Icon, className } = REVIEW[state];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] leading-[18px]", className)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {label}
    </span>
  );
}

/** "Added by you" or "Edited by you": the person made or changed this. */
export function HumanMarker({ text }: { text: "Added by you" | "Edited by you" }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] leading-4 text-ink-muted">
      <UserRound aria-hidden className="size-3.5 shrink-0" />
      {text}
    </span>
  );
}
