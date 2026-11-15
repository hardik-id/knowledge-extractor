import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Usually one Button. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg bg-surface-tint px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface-raised text-link">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-xl leading-7 font-semibold">{title}</h2>
        {description && (
          <p className="mx-auto max-w-[52ch] text-[15px] leading-[22px] text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
