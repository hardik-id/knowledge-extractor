import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

interface StudioPanelProps {
  id: string;
  title: string;
  description?: string;
  /** Status line after the description. */
  status?: React.ReactNode;
  /** Controls on the right of the heading. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Remove body padding. */
  flush?: boolean;
}

/** A Studio page: the shared page header, then the content in the page's one scrolling region. */
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
      <PageHeader
        id={`${id}-title`}
        title={title}
        facts={
          <div className="space-y-1">
            {description && <p className="max-w-[72ch]">{description}</p>}
            {status}
          </div>
        }
        actions={actions}
      />
      <div
        className={cn(
          "relative min-w-0 flex-1 md:min-h-0 md:overflow-y-auto",
          !flush && "px-4 py-4 sm:px-6",
        )}
      >
        {children}
      </div>
    </section>
  );
}
