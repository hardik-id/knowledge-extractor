import type { ReactNode } from "react";
import { ConnectionBanner } from "@/features/run/connection-banner";

/**
 * The frame of a workspace's screens: no sidebar, the workspace's own top bar (rendered by each
 * page, which knows what it offers), and from 960px one screen with a single scrolling region.
 * Below 960px the page scrolls as a whole and the top bar sticks.
 */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <a
        href="#workspace-content"
        className="sr-only z-50 rounded-control bg-background px-4 py-2 text-link focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <main id="main" className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <ConnectionBanner />
        <div className="flex flex-1 flex-col md:min-h-0">{children}</div>
      </main>
    </div>
  );
}
