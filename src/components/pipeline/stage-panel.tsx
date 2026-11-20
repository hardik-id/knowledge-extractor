import { PageHeader } from "@/components/layout/page-header";
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
 * The content of the active-stage panel: header, body, proceed footer.
 * From 960px the body scrolls inside the panel and the footer stays pinned.
 */
export function StagePanel({ stageId, actions, status, children, flush }: StagePanelProps) {
  const meta = STAGE_META[stageId];
  return (
    <section aria-labelledby={`stage-${stageId}-title`} className="flex flex-1 flex-col md:min-h-0">
      <PageHeader
        id={`stage-${stageId}-title`}
        title={meta.label}
        facts={
          <div className="space-y-1">
            <p className="max-w-[72ch]">
              Stage {stageIndex(stageId) + 1} of {STAGE_ORDER.length}. {meta.description}
            </p>
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

      <StageFooter stageId={stageId} />
    </section>
  );
}
