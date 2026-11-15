import { STAGE_META } from "@/features/stages/config";
import { STAGE_ORDER, stageIndex } from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { StageId } from "@/types/pipeline";
import { StageFooter } from "./stage-footer";

interface StagePanelProps {
  stageId: StageId;
  /** Controls on the right of the heading (run, retry, filters). */
  actions?: React.ReactNode;
  /** Status chip or summary under the description. */
  status?: React.ReactNode;
  children: React.ReactNode;
  /** Remove body padding, e.g. for a full-bleed split view. */
  flush?: boolean;
}

/**
 * The content of the active-stage panel: heading, body, proceed footer.
 * From 960px the body scrolls inside the panel and the footer stays pinned.
 */
export function StagePanel({ stageId, actions, status, children, flush }: StagePanelProps) {
  const meta = STAGE_META[stageId];
  return (
    <section aria-labelledby={`stage-${stageId}-title`} className="flex flex-1 flex-col md:min-h-0">
      <header className="flex shrink-0 flex-col gap-4 border-b border-border-subtle px-5 py-5 sm:px-8 sm:py-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-5 font-semibold tracking-[0.06em] text-link uppercase">
            Stage {stageIndex(stageId) + 1} of {STAGE_ORDER.length}
          </p>
          <h1
            id={`stage-${stageId}-title`}
            className="text-[26px] leading-8 font-bold sm:text-[32px] sm:leading-10"
          >
            {meta.label}
          </h1>
          <p className="max-w-[60ch] text-ink-muted">{meta.description}</p>
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

      <StageFooter stageId={stageId} />
    </section>
  );
}
