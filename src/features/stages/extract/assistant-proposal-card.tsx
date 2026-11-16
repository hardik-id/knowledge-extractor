import { CircleCheck, CircleSlash, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssistantProposal } from "@/services/contracts";
import type { Draft } from "./definition-draft";
import { diffProposal } from "./proposal-diff";

export type ProposalOutcome = "open" | "applied" | "dismissed" | "replaced";

const OUTCOME: Record<
  Exclude<ProposalOutcome, "open">,
  { label: string; icon: typeof CircleCheck }
> = {
  applied: { label: "Applied", icon: CircleCheck },
  dismissed: { label: "Dismissed", icon: CircleSlash },
  replaced: { label: "Replaced by a newer proposal", icon: History },
};

export function AssistantProposalCard({
  proposal,
  draft,
  outcome,
  onApply,
  onDismiss,
}: {
  proposal: AssistantProposal;
  draft: Draft;
  outcome: ProposalOutcome;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const changes = diffProposal(draft, proposal.definition);
  const done = outcome === "open" ? null : OUTCOME[outcome];
  return (
    <section
      aria-label="Proposed changes"
      className="space-y-2 rounded-lg border border-border-subtle bg-surface-tint p-3"
    >
      <h3 className="text-[15px] leading-6 font-semibold text-ink-heading">Proposed changes</h3>
      {changes.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-ink-muted">No changes to what you have</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-[18px] text-ink">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {proposal.reasons.length > 0 && (
        <ul className="space-y-0.5 text-[13px] leading-[18px] text-ink-muted">
          {proposal.reasons.map((r, i) => (
            <li key={`${r.path}-${i}`}>
              <span className="font-semibold text-ink">{r.path}</span> — {r.reason}
            </li>
          ))}
        </ul>
      )}
      {done ? (
        <p className="flex items-center gap-1 text-[13px] leading-[18px] font-semibold text-ink-muted">
          <done.icon aria-hidden className="size-4 shrink-0" />
          {done.label}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onApply}>
            Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </section>
  );
}
