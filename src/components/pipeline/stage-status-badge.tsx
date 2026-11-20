import { Check, CircleAlert, CircleDashed, LoaderCircle, Lock, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageRunStatus } from "@/types/pipeline";

type BadgeStatus = StageRunStatus | "locked";

const CONFIG: Record<BadgeStatus, { label: string; icon: typeof Check; className: string }> = {
  idle: { label: "Not started", icon: CircleDashed, className: "text-ink-muted" },
  running: { label: "Running", icon: LoaderCircle, className: "text-link" },
  ready: { label: "Ready to proceed", icon: CircleCheck, className: "text-success" },
  done: { label: "Done", icon: Check, className: "text-success" },
  error: { label: "Needs attention", icon: CircleAlert, className: "text-danger" },
  locked: { label: "Locked", icon: Lock, className: "text-ink-muted" },
};

interface StageStatusBadgeProps {
  status: BadgeStatus;
  /**
   * `pill`: filled chip for headers. `inline`: small text line for lists. `icon`: the icon alone
   * where there is no room for the word (the sidebar); the word is read out and shown on hover.
   */
  variant?: "pill" | "inline" | "icon";
  className?: string;
}

/** Status shown with an icon and a word, never colour alone. */
export function StageStatusBadge({ status, variant = "pill", className }: StageStatusBadgeProps) {
  const { label, icon: Icon, className: tone } = CONFIG[status];
  if (variant === "icon") {
    return (
      <span title={label} className={cn("inline-flex", tone, className)}>
        <Icon
          aria-hidden
          className={cn("size-3.5 shrink-0", status === "running" && "animate-spin")}
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-normal",
        variant === "pill"
          ? "rounded-full bg-surface-tint px-3 py-1 text-sm leading-5 font-semibold"
          : "text-[13px] leading-[18px]",
        tone,
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", status === "running" && "animate-spin")}
      />
      {label}
    </span>
  );
}
