import { cn } from "@/lib/utils";

interface SplitViewProps {
  /** Left pane: a list of items. */
  list: React.ReactNode;
  /** Right pane: the selected item. */
  detail: React.ReactNode;
  listLabel: string;
  /**
   * An optional third pane about the selected item (e.g. its extracted
   * records). From 1280px it is a column on the right. From 960px it sits
   * below the detail; below that everything is stacked.
   */
  aside?: React.ReactNode;
  asideLabel?: string;
  className?: string;
}

/**
 * List + detail inside a stage panel (Transform, Classify, …).
 * Side by side from 960px; stacked (list first) below.
 */
export function SplitView({
  list,
  detail,
  listLabel,
  aside,
  asideLabel,
  className,
}: SplitViewProps) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-lg border border-border-subtle",
        aside
          ? "md:h-[max(40rem,calc(100dvh-20rem))] md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:h-[max(28rem,calc(100dvh-24rem))] lg:grid-cols-[16rem_minmax(0,1fr)_24rem] lg:grid-rows-1"
          : "md:h-[max(28rem,calc(100dvh-24rem))] md:grid-cols-[18rem_minmax(0,1fr)]",
        className,
      )}
    >
      <nav
        aria-label={listLabel}
        className={cn(
          "relative max-h-72 overflow-y-auto border-b border-border-subtle bg-surface-tint md:max-h-none md:border-r md:border-b-0",
          aside && "md:row-span-2 lg:row-span-1",
        )}
      >
        {list}
      </nav>
      <div className="relative min-w-0 overflow-y-auto bg-surface-raised">{detail}</div>
      {aside && (
        <section
          aria-label={asideLabel}
          className="relative min-w-0 overflow-y-auto border-t border-border-subtle bg-surface-tint md:col-start-2 lg:col-start-3 lg:border-t-0 lg:border-l"
        >
          {aside}
        </section>
      )}
    </div>
  );
}
