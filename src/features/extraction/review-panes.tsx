import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewPanesProps {
  /** The files: a compact list. */
  list: React.ReactNode;
  listLabel: string;
  /** The open file. */
  detail: React.ReactNode;
  /** A third pane about the open file (its records). */
  aside?: React.ReactNode;
  asideLabel?: string;
}

/**
 * Review and Output: the files, the open file and, optionally, its records, as panes
 * separated by hairlines with no frame around them. From 960px each pane scrolls by
 * itself; from 1280px the records are a column on the right, below that they sit under
 * the document. Below 960px everything is stacked. A screen with less above the panes sets
 * `--review-offset` (default 15rem) on an ancestor.
 */
export function ReviewPanes({ list, listLabel, detail, aside, asideLabel }: ReviewPanesProps) {
  return (
    <div
      className={cn(
        "grid border-b border-border-subtle",
        aside
          ? "md:h-[max(40rem,calc(100dvh-var(--review-offset,15rem)))] md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:h-[max(28rem,calc(100dvh-var(--review-offset,15rem)))] lg:grid-cols-[12rem_minmax(0,1fr)_22rem] lg:grid-rows-1"
          : "md:h-[max(28rem,calc(100dvh-var(--review-offset,15rem)))] md:grid-cols-[13rem_minmax(0,1fr)]",
      )}
    >
      <nav
        aria-label={listLabel}
        className={cn(
          "max-h-48 overflow-y-auto border-b border-border-subtle md:max-h-none md:border-r md:border-b-0",
          aside && "md:row-span-2 lg:row-span-1",
        )}
      >
        {list}
      </nav>
      <div className="relative min-w-0 md:overflow-y-auto">{detail}</div>
      {aside && (
        <section
          aria-label={asideLabel}
          className="relative min-w-0 border-t border-border-subtle md:col-start-2 md:overflow-y-auto lg:col-start-3 lg:border-t-0 lg:border-l"
        >
          {aside}
        </section>
      )}
    </div>
  );
}

export interface FileListItem {
  id: string;
  name: string;
  /** Something after the name, such as a status. */
  note?: React.ReactNode;
}

/** The compact list of files: the open one is tinted. */
export function FileList({
  items,
  activeId,
  icon: Icon,
  onSelect,
}: {
  items: FileListItem[];
  activeId: string | undefined;
  icon: LucideIcon;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col p-2">
      {items.map(({ id, name, note }) => {
        const selected = activeId === id;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex min-h-8 w-full items-center gap-2 rounded-control px-2 py-1 text-left transition-colors coarse:min-h-touch",
                selected ? "bg-surface-hover" : "hover:bg-surface-tint",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate font-mono text-small text-ink",
                    selected && "font-medium",
                  )}
                >
                  {name}
                </span>
                {note}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A small segmented control: one option is pressed. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 rounded-control border border-border-control p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-control-xs rounded-control px-2 text-caption text-ink transition-colors coarse:min-h-touch coarse:px-3",
            value === option.value ? "bg-surface-hover font-semibold" : "hover:bg-surface-tint",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
