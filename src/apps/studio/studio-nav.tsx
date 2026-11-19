"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { projectIdFromPath, STUDIO_HOME, studioSteps } from "./nav-steps";

/** The open project as the address names it: null until it has loaded here. */
function useOpenProject() {
  const projectId = projectIdFromPath(usePathname());
  const project = usePipelineStore((s) =>
    projectId !== null && s.projectId === projectId && s.projectLoad === "ready" ? s.project : null,
  );
  const documentCount = usePipelineStore((s) => (project ? s.runFiles.length : 0));
  return { projectId, project, documentCount };
}

/** The project's name, its two steps and the way back to all projects. */
export function StudioNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projectId, project, documentCount } = useOpenProject();
  const steps = studioSteps(pathname, documentCount > 0);

  if (projectId === null) {
    return (
      <p className="px-6 pt-2 pb-6 text-[15px] leading-[22px] text-ink-muted">
        Open a project, or start a new one.
      </p>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 pt-2 pb-6">
      {project ? (
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[17px] leading-6 font-semibold text-ink-heading">
            {project.name}
          </p>
          <p className="text-[15px] leading-[22px] text-ink-muted">
            <span className="font-semibold text-ink">{plural(documentCount, "document")}</span> in
            this project
          </p>
        </div>
      ) : (
        <div aria-hidden className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-32" />
        </div>
      )}

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
        <Button variant="ghost" size="sm" asChild className="-ml-3 text-ink-muted">
          <Link href={STUDIO_HOME} onClick={onNavigate}>
            <ArrowLeft data-icon="inline-start" />
            All projects
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Below 960px: the current step as a button that opens the same list in a sheet. */
export function StudioMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { projectId, documentCount } = useOpenProject();
  const current = studioSteps(pathname, documentCount > 0).find((s) => s.current);
  if (projectId === null) return null;

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
