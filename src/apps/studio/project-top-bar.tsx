"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AppSwitcher } from "@/components/layout/app-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/features/auth/user-menu";
import { ExtractionActions, ExtractionFacts } from "@/features/extraction/extraction-actions";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { usePipelineStore } from "@/store/pipeline-store";
import { projectHref, STUDIO_HOME } from "./nav-steps";
import { ProjectMenu } from "./project-menu";

/**
 * The one bar of a project screen (it replaces the sidebar and the page header): the logo, the
 * way back to all projects, the project's menu, then on the right what the screen offers and the
 * theme and account. It is one 48px row from 960px and wraps below. The right side is composed
 * here, so what it holds changes in this file only.
 */
export function ProjectTopBar({ extraction }: { extraction?: ExtractionRun }) {
  const projectId = usePipelineStore((s) => s.projectId);
  return (
    <header
      data-testid="project-top-bar"
      className="sticky top-0 z-30 shrink-0 border-b border-border-subtle bg-background md:static"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-[max(16px,env(safe-area-inset-left))] py-1.5">
        {/* The switcher reads the address, only known at request time under a dynamic route. */}
        <Suspense>
          <AppSwitcher compact markOnly />
        </Suspense>
        <Link
          href={STUDIO_HOME}
          className="rounded-control px-1 text-body font-medium text-ink hover:underline"
        >
          Projects
        </Link>
        <span aria-hidden className="text-ink-muted">
          /
        </span>
        <ProjectMenu />
        {extraction && projectId && (
          <Link
            href={projectHref(projectId)}
            aria-label="Change documents"
            className="rounded-control px-1 text-small text-link underline-offset-4 hover:underline"
          >
            Documents
          </Link>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          {extraction && (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
                <ExtractionFacts extraction={extraction} />
              </div>
              <ExtractionActions extraction={extraction} showPublish={false} showSave />
            </>
          )}
          <ThemeToggle />
          <UserMenu compact />
        </div>
      </div>
    </header>
  );
}
