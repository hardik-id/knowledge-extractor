"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, FileText, ListOrdered, Sparkles } from "lucide-react";
import { NavRow } from "@/components/layout/nav-row";
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

const STEP_ICONS = { documents: FileText, extraction: Sparkles } as const;

/** The project's name and facts, its two steps as rows, and a quiet way back to all projects. */
export function StudioNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projectId, project, documentCount } = useOpenProject();
  const steps = studioSteps(pathname, documentCount > 0);

  if (projectId === null) {
    return (
      <p className="px-5 pt-1 pb-3 text-small text-ink-muted">
        Open a project, or start a new one.
      </p>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3 px-3 pt-1 pb-3">
      {project ? (
        <div className="min-w-0 space-y-0.5 px-2">
          <p className="truncate text-body font-semibold text-ink-heading">{project.name}</p>
          <p className="text-small text-ink-muted">{plural(documentCount, "document")}</p>
        </div>
      ) : (
        <div aria-hidden className="space-y-2 px-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      )}

      <nav aria-label="Steps">
        <ol className="flex flex-col gap-0.5">
          {steps.map((step) => (
            <li key={step.id}>
              <NavRow
                href={step.href}
                icon={STEP_ICONS[step.id]}
                label={step.label}
                current={step.current}
                disabled={step.disabled}
                reason={step.reason}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-auto pt-2">
        <Button variant="ghost" size="sm" asChild className="text-ink-muted">
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
