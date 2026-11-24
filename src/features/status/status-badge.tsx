"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  FlaskConical,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { StatusPart, StatusState } from "@/services/contracts";
import {
  OVERALL_WORD,
  isBadgeVisible,
  overallState,
  partDetail,
  partName,
  testNote,
  type OverallState,
} from "./status-rules";
import { useBackendStatus } from "./use-backend-status";

const OVERALL_LOOK: Record<OverallState, { icon: LucideIcon; tone: string }> = {
  problem: { icon: CircleAlert, tone: "text-danger" },
  stub: { icon: FlaskConical, tone: "text-warning" },
  mock: { icon: FlaskConical, tone: "text-warning" },
  live: { icon: CircleCheck, tone: "text-success" },
  unknown: { icon: CircleHelp, tone: "text-ink-muted" },
};

const PART_LOOK: Record<StatusState, { icon: LucideIcon; tone: string }> = {
  stub: { icon: CircleDashed, tone: "text-warning" },
  ok: { icon: CircleCheck, tone: "text-success" },
  failing: { icon: CircleAlert, tone: "text-danger" },
  unknown: { icon: CircleHelp, tone: "text-ink-muted" },
};

const DEVELOPMENT = process.env.NODE_ENV !== "production";

/**
 * What the backend is made of, as a badge in the top bar that opens a panel: the worst state in
 * one word with an icon, and each part under it. The word hides below 600px, or below 1360px in
 * a crowded bar (`wordFrom`): the icon stays, and the name and the tooltip say the state. Hidden in a production build unless something is a stub or failing.
 * `side` and `align` place the panel where the badge sits.
 */
export function BackendStatusBadge({
  side = "bottom",
  align = "end",
  wordFrom = "sm",
  className,
}: {
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Where the word appears: from 600px (`sm`, the default) or from 1360px (`wide`, a crowded bar). */
  wordFrom?: "sm" | "wide";
  className?: string;
}) {
  const view = useBackendStatus();
  const [open, setOpen] = useState(false);
  const headingId = useId();

  const overall = view.loading || view.failed ? "unknown" : overallState(view.status);
  if (!isBadgeVisible(overall, DEVELOPMENT)) return null;

  const word = view.loading ? "Checking" : OVERALL_WORD[overall];
  const { icon: Icon, tone } = view.loading
    ? { icon: LoaderCircle, tone: "text-ink-muted" }
    : OVERALL_LOOK[overall];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) view.refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Backend status: ${word}`}
          title={`Backend status: ${word}`}
          data-testid="status-badge"
          className={cn(
            wordFrom === "sm" ? "px-2 sm:px-2.5" : "px-2 min-[1360px]:px-2.5",
            tone,
            className,
          )}
        >
          <Icon aria-hidden className={cn(view.loading && "animate-spin")} />
          <span
            className={cn(
              "hidden whitespace-nowrap text-ink",
              wordFrom === "sm" ? "sm:inline" : "min-[1360px]:inline",
            )}
          >
            {word}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        aria-labelledby={headingId}
        className="w-88 p-0"
        data-testid="status-panel"
      >
        <StatusPanel view={view} headingId={headingId} />
      </PopoverContent>
    </Popover>
  );
}

function StatusPanel({
  view,
  headingId,
}: {
  view: ReturnType<typeof useBackendStatus>;
  headingId: string;
}) {
  // Read once per opening: the panel is not a clock.
  const [now] = useState(() => Date.now());
  const { status } = view;
  return (
    <div className="flex flex-col gap-3 p-3">
      <h2 id={headingId} className="text-section font-semibold text-ink-heading">
        Backend status
      </h2>
      {status === undefined && view.failed && (
        <p className="text-body text-ink">
          Couldn&apos;t read the backend&apos;s status.{" "}
          <Button variant="link" className="h-auto p-0" onClick={view.refresh}>
            Try again
          </Button>
        </p>
      )}
      {status === undefined && !view.failed && (
        <p role="status" className="text-body text-ink-muted">
          Checking…
        </p>
      )}
      {status === null && (
        <p className="text-body text-ink">This backend does not report its status.</p>
      )}
      {status && status.parts.length === 0 && (
        <p className="text-body text-ink">This backend reported no parts.</p>
      )}
      {status && (
        <>
          <ul className="flex flex-col gap-2">
            {status.parts.map((part) => (
              <PartRow key={part.id} part={part} now={now} />
            ))}
          </ul>
          {status.environment !== "mock" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button variant="secondary" disabled={view.testing} onClick={view.test}>
                {view.testing && <LoaderCircle aria-hidden className="animate-spin" />}
                {view.testing ? "Testing…" : "Test connections"}
              </Button>
              <span role="status" className="text-small text-ink-muted">
                {view.testing
                  ? "Calling each real part"
                  : testNote(view.cachedAnswer, status, view.testedAt ?? now)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PartRow({ part, now }: { part: StatusPart; now: number }) {
  const { icon: Icon, tone } = PART_LOOK[part.state];
  return (
    <li className="grid grid-cols-[6.5rem_1fr] gap-x-3" data-part={part.id}>
      <span className="text-body font-medium text-ink-heading">{partName(part.id)}</span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5 text-body text-ink">
          <Icon aria-hidden className={cn("size-4 shrink-0", tone)} />
          <span className="min-w-0 break-words">{part.label}</span>
        </span>
        <span className="pl-[22px] text-small text-ink-muted">{partDetail(part, now)}</span>
      </span>
    </li>
  );
}
