import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  History,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CellStatus } from "@/services/contracts";

const CONFIG: Record<CellStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: "Waiting", icon: CircleDashed, className: "text-ink-muted" },
  queued: { label: "Queued", icon: Clock, className: "text-ink-muted" },
  running: { label: "Working", icon: LoaderCircle, className: "text-link" },
  succeeded: { label: "Done", icon: CircleCheck, className: "font-semibold text-success" },
  failed: { label: "Failed", icon: CircleAlert, className: "font-semibold text-danger" },
  stale: { label: "Out of date", icon: History, className: "font-semibold text-warning" },
};

interface CellStatusLabelProps {
  status: CellStatus;
  /** Replaces the default word, e.g. "Downloaded" for a finished download. */
  label?: string;
  /** Extra detail on hover, e.g. why it failed. */
  title?: string;
  className?: string;
}

/** The state of one file in one stage, shown with an icon and a word, never colour alone. */
export function CellStatusLabel({ status, label, title, className }: CellStatusLabelProps) {
  const { label: defaultLabel, icon: Icon, className: tone } = CONFIG[status];
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 text-[13px] leading-[18px]", tone, className)}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", status === "running" && "animate-spin")} />
      {label ?? defaultLabel}
    </span>
  );
}
