"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ListOrdered, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/store/pipeline-store";
import { studioSteps } from "./nav-steps";

/** The studio's two steps, the document count and Start over. */
export function StudioNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasRun = usePipelineStore((s) => s.runId !== null);
  const count = usePipelineStore((s) => s.selectedFiles.length);
  const resetRun = usePipelineStore((s) => s.resetRun);
  const steps = studioSteps(pathname, hasRun);

  const startOver = () => {
    resetRun();
    onNavigate?.();
    router.push("/studio");
  };

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 pt-2 pb-6">
      <p className="text-[15px] leading-[22px] text-ink-muted">
        <span className="font-semibold text-ink">{plural(count, "document")}</span> in this
        workspace
      </p>

      <nav aria-label="Steps">
        <ol className="flex flex-col gap-2">
          {steps.map((step) => {
            const card =
              "flex min-h-14 items-center justify-center rounded-lg border-2 px-4 py-3 text-center text-[17px] leading-6 font-semibold";
            return (
              <li key={step.id}>
                {step.disabled ? (
                  <div
                    aria-disabled="true"
                    title={step.reason}
                    className={cn(
                      card,
                      "cursor-not-allowed flex-col border-dashed border-border-subtle text-ink-muted",
                    )}
                  >
                    {step.label}
                    <span className="text-[13px] leading-[18px] font-normal">{step.reason}</span>
                  </div>
                ) : (
                  <Link
                    href={step.href}
                    onClick={onNavigate}
                    aria-current={step.current ? "step" : undefined}
                    className={cn(
                      card,
                      "bg-surface-raised transition-[background-color,border-color,box-shadow]",
                      step.current
                        ? "border-brand-blue text-ink-heading shadow-[0_0_16px_color-mix(in_srgb,var(--brand-blue)_45%,transparent)]"
                        : "border-border-subtle text-ink hover:border-border-control hover:shadow-card",
                    )}
                  >
                    {step.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-auto pt-2">
        <Button variant="ghost" size="sm" onClick={startOver} className="-ml-3 text-ink-muted">
          <RotateCcw data-icon="inline-start" />
          Start over
        </Button>
      </div>
    </div>
  );
}

/** Below 960px: the current step as a button that opens the same list in a sheet. */
export function StudioMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const hasRun = usePipelineStore((s) => s.runId !== null);
  const current = studioSteps(pathname, hasRun).find((s) => s.current);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden">
          <ListOrdered data-icon="inline-start" />
          {current?.label ?? "Steps"}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(20rem,88vw)] bg-surface-tint p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Studio steps</SheetTitle>
          <SheetDescription>Switch between documents and extraction.</SheetDescription>
        </SheetHeader>
        <StudioNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
