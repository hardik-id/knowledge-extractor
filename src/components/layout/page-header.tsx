import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Id of the `h1`, for the page section's `aria-labelledby`. */
  id: string;
  title: string;
  /** The status and facts line under the title: a sentence, a summary, a badge. */
  facts?: ReactNode;
  /** The page's actions, on the right (stacked under the title on a phone). */
  actions?: ReactNode;
  className?: string;
}

/**
 * The top of a page, shared by both apps: the title, the facts line and the actions.
 * Put it above the page's scrolling region (a flex column whose body scrolls) and it stays
 * in view while the content scrolls under it. Below 960px the page scrolls as a whole and the
 * header scrolls away with it, so it never covers a quarter of a phone screen.
 */
export function PageHeader({ id, title, facts, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-3 border-b border-border-subtle bg-background px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h1 id={id} className="text-ink-heading">
          {title}
        </h1>
        {facts && <div className="text-small text-ink-muted">{facts}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
