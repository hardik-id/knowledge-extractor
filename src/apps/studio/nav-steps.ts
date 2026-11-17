/** The two steps of Knowledge Studio. Pure, so the sidebar's rules can be tested. */

export type StudioStepId = "documents" | "extraction";

export interface StudioStep {
  id: StudioStepId;
  label: string;
  href: string;
  current: boolean;
  /** Extraction needs a run, and a run needs documents. */
  disabled: boolean;
  /** Why it is disabled, for people and screen readers. */
  reason?: string;
}

const STEPS = [
  { id: "documents", label: "Documents", href: "/studio" },
  { id: "extraction", label: "Extraction", href: "/studio/extract" },
] as const;

export function studioSteps(pathname: string, hasRun: boolean): StudioStep[] {
  return STEPS.map((step) => {
    const disabled = step.id === "extraction" && !hasRun;
    return {
      ...step,
      current: step.href === "/studio" ? pathname === "/studio" : pathname.startsWith(step.href),
      disabled,
      reason: disabled ? "Open documents in extraction first." : undefined,
    };
  });
}
