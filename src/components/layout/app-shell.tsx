import { ConnectionBanner } from "@/features/run/connection-banner";
import { AppHeader } from "./app-header";
import { Brand } from "./brand";
import { StageSidebar } from "./stage-sidebar";
import { ThemeToggle } from "./theme-toggle";

/**
 * From 960px (md): one screen, no page scroll. Stage cards on the left, a
 * vertical rule, and the active stage in a large rounded panel on the right
 * that scrolls inside itself with its proceed footer pinned to the bottom.
 *
 * Below 960px: a header with a stage menu (sheet), and the panel flows with
 * the page; the proceed footer sticks to the bottom of the screen.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-link focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to stage
      </a>
      <AppHeader />

      <aside
        aria-label="Pipeline stages"
        className="hidden w-80 shrink-0 flex-col border-r-2 border-border-subtle md:flex"
      >
        <div className="flex h-18 shrink-0 items-center justify-between gap-2 px-6">
          <Brand />
          <ThemeToggle />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StageSidebar />
        </div>
      </aside>

      <main id="main" className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 md:min-h-0">
        <ConnectionBanner />
        <div className="flex flex-1 flex-col rounded-xl border-2 border-border-subtle bg-surface-raised shadow-card md:min-h-0 md:overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
