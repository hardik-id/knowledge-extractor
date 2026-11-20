import { stageHref } from "@/lib/stages";
import type { StageMeta } from "@/features/stages/config";
import type { StageAccess, StageRunStatus } from "@/types/pipeline";
import { StageStatusBadge } from "@/components/pipeline/stage-status-badge";
import { NavRow } from "./nav-row";

interface StageNavItemProps {
  meta: StageMeta;
  access: StageAccess;
  runStatus: StageRunStatus;
  onNavigate?: () => void;
}

/** One stage in the sidebar: a row with its icon, label and, while running, done or failed, its status. */
export function StageNavItem({ meta, access, runStatus, onNavigate }: StageNavItemProps) {
  const locked = access === "locked";
  return (
    <NavRow
      href={stageHref(meta.id)}
      icon={meta.icon}
      label={meta.label}
      current={access === "current"}
      disabled={locked}
      reason={locked ? `Finish the earlier stages to open ${meta.label}` : undefined}
      trailing={
        locked || runStatus === "idle" || runStatus === "ready" ? null : (
          <StageStatusBadge status={runStatus} variant="icon" className="shrink-0" />
        )
      }
      onNavigate={onNavigate}
    />
  );
}
