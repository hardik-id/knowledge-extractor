"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AppSwitcher } from "@/components/layout/app-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/features/auth/user-menu";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { usePipelineStore } from "@/store/pipeline-store";
import { projectHref, STUDIO_HOME } from "./nav-steps";
import { ProjectMenu } from "./project-menu";
import { DocumentSwitcher } from "./top-bar/document-switcher";
import { MoreMenu } from "./top-bar/more-menu";
import { RunButton } from "./top-bar/run-button";
import { VersionMenu } from "./top-bar/version-menu";

/**
 * The one bar of a project screen (it replaces the sidebar and the page header): the logo, the
 * way back to all projects, the project's menu, then on the right what the screen offers and the
 * theme and account. It is one 48px row from 960px and wraps below. The right side is composed
 * here, so what it holds changes in this file only.
 */
export function ProjectTopBar({ extraction }: { extraction?: ExtractionRun }) {
  const projectId = usePipelineStore((s) => s.projectId);
  return (
    <>
      <nav
        aria-label="Project"
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
          <span className="flex min-w-0 items-center gap-x-2">
            <span aria-hidden className="text-ink-muted">
              /
            </span>
            <ProjectMenu />
          </span>
          {extraction && <DocumentSwitcher />}
          <div className="ml-auto flex items-center gap-x-2 md:order-last md:ml-0">
            <ThemeToggle />
            <UserMenu compact />
          </div>
          {extraction && projectId && (
            <Link
              href={projectHref(projectId)}
              className="rounded-control px-1 text-small text-link underline-offset-4 hover:underline"
            >
              Documents
            </Link>
          )}

          <div className="contents md:ml-auto md:flex md:flex-wrap md:items-center md:justify-end md:gap-x-2 md:gap-y-1">
            {extraction && (
              <>
                <VersionMenu extraction={extraction} />
                <RunButton extraction={extraction} />
                <MoreMenu extraction={extraction} />
              </>
            )}
          </div>
        </div>
      </nav>
      {/* What the skip link jumps to: the first stop after the bar. */}
      <div id="project-content" tabIndex={-1} className="outline-none" />
    </>
  );
}
