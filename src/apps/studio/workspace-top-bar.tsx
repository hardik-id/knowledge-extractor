"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Suspense } from "react";
import { AppSwitcher } from "@/components/layout/app-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/features/extraction/review-panes";
import { BackendStatusBadge } from "@/features/status/status-badge";
import { UserMenu } from "@/features/auth/user-menu";
import type { ExtractionRun } from "@/features/extraction/use-extraction-run";
import { STUDIO_HOME } from "./nav-steps";
import { WorkspaceMenu } from "./workspace-menu";
import { DocumentSwitcher } from "./top-bar/document-switcher";
import { MoreMenu } from "./top-bar/more-menu";
import { RunButton } from "./top-bar/run-button";
import { VersionMenu } from "./top-bar/version-menu";
import { useScreenControls } from "./working-screen/screen-state";

/**
 * The one bar of a workspace screen (it replaces the sidebar and the page header): the logo, the
 * way back to all workspaces, the workspace's menu, then on the right what the screen offers and the
 * theme and account. It is one 48px row from 960px and wraps below. The right side is composed
 * here, so what it holds changes in this file only.
 */
export function WorkspaceTopBar({ extraction }: { extraction?: ExtractionRun }) {
  const controls = useScreenControls();
  // Nothing to show as output while there is nothing to extract.
  const configured = (extraction?.definition.draft?.recordTypes.length ?? 0) > 0;
  return (
    <>
      <nav
        aria-label="Workspace"
        data-testid="workspace-top-bar"
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
            Workspaces
          </Link>
          <span className="flex min-w-0 items-center gap-x-2">
            <span aria-hidden className="text-ink-muted">
              /
            </span>
            <WorkspaceMenu />
          </span>
          {extraction && <DocumentSwitcher />}
          {extraction && controls && configured && (
            <Segmented
              label="Show"
              value={controls.view}
              onChange={controls.setView}
              options={[
                { value: "document", label: "Document" },
                { value: "output", label: "Output" },
              ]}
            />
          )}
          <div className="ml-auto flex items-center gap-x-2 md:order-last md:ml-0">
            <BackendStatusBadge wordFrom="wide" />
            <ThemeToggle />
            <UserMenu compact />
          </div>

          <div className="contents md:ml-auto md:flex md:flex-wrap md:items-center md:justify-end md:gap-x-2 md:gap-y-1">
            {extraction && (
              <>
                <VersionMenu extraction={extraction} />
                {controls && (
                  <Button
                    variant="outline"
                    aria-label="Assistant"
                    title="Assistant"
                    onClick={controls.requestAssistant}
                  >
                    <Sparkles data-icon="inline-start" />
                    {/* Below 1360px the word makes the bar wrap: the icon alone, with the name kept. */}
                    <span aria-hidden className="hidden max-sm:inline min-[1360px]:inline">
                      Assistant
                    </span>
                  </Button>
                )}
                <RunButton extraction={extraction} />
                <MoreMenu extraction={extraction} />
              </>
            )}
          </div>
        </div>
      </nav>
      {/* What the skip link jumps to: the first stop after the bar. */}
      <div id="workspace-content" tabIndex={-1} className="outline-none" />
    </>
  );
}
