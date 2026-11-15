import { cn } from "@/lib/utils";

interface SplitViewProps {
  /** Left pane: a list of items. */
  list: React.ReactNode;
  /** Right pane: the selected item. */
  detail: React.ReactNode;
  listLabel: string;
  className?: string;
}

/**
 * List + detail inside a stage panel (Transform, Classify, …).
 * Side by side from 960px; stacked (list first) below.
 */
export function SplitView({ list, detail, listLabel, className }: SplitViewProps) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-lg border border-border-subtle md:h-[max(28rem,calc(100dvh-24rem))] md:grid-cols-[18rem_minmax(0,1fr)]",
        className,
      )}
    >
      <nav
        aria-label={listLabel}
        className="max-h-72 overflow-y-auto border-b border-border-subtle bg-surface-tint md:max-h-none md:border-r md:border-b-0"
      >
        {list}
      </nav>
      <div className="min-w-0 overflow-y-auto bg-surface-raised">{detail}</div>
    </div>
  );
}
