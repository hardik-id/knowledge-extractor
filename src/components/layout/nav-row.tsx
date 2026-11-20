import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavRowProps {
  href: string;
  icon: LucideIcon;
  label: string;
  /** The open step: a tinted ground and heading ink. */
  current?: boolean;
  /** Not openable yet: muted, not a link. `reason` is read out and shown on hover. */
  disabled?: boolean;
  reason?: string;
  /** Something small after the label, such as a status. */
  trailing?: ReactNode;
  onNavigate?: () => void;
}

const ROW =
  "flex h-control w-full items-center gap-2 rounded-control px-2 text-body coarse:min-h-touch";

/** One step in an app's sidebar: icon and label on a 32px row, the same in every app. */
export function NavRow({
  href,
  icon: Icon,
  label,
  current,
  disabled,
  reason,
  trailing,
  onNavigate,
}: NavRowProps) {
  const content = (
    <>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {trailing}
    </>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        title={reason}
        className={cn(ROW, "cursor-not-allowed text-ink-muted")}
      >
        {content}
        {reason && <span className="sr-only">{reason}</span>}
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={current ? "step" : undefined}
      className={cn(
        ROW,
        "transition-colors",
        current
          ? "bg-surface-hover font-semibold text-ink-heading"
          : "text-ink hover:bg-surface-tint",
      )}
    >
      {content}
    </Link>
  );
}
