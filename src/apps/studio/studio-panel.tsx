import { cn } from "@/lib/utils";

interface StudioPanelProps {
  id: string;
  title: string;
  description: string;
  /** Status line under the description. */
  status?: React.ReactNode;
  /** Controls on the right of the heading. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Remove body padding. */
  flush?: boolean;
}

/** The look of the pipeline's StagePanel (heading, body) without "Stage N of M" or the footer. */
export function StudioPanel({
  id,
  title,
  description,
  status,
  actions,
  children,
  flush,
}: StudioPanelProps) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-1 flex-col md:min-h-0">
      <header className="flex shrink-0 flex-col gap-4 border-b border-border-subtle px-5 py-5 sm:px-8 sm:py-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <h1
            id={`${id}-title`}
            className="text-[26px] leading-8 font-bold sm:text-[32px] sm:leading-10"
          >
            {title}
          </h1>
          <p className="max-w-[60ch] text-ink-muted">{description}</p>
          {status}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div
        className={cn(
          "min-w-0 flex-1 md:min-h-0 md:overflow-y-auto",
          !flush && "px-5 py-5 sm:px-8 sm:py-6",
        )}
      >
        {children}
      </div>
    </section>
  );
}
