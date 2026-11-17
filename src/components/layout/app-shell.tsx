import type { ReactNode } from "react";
import { ConnectionBanner } from "@/features/run/connection-banner";
import { AppSwitcher } from "./app-switcher";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
  /** The app's navigation, shown in the sidebar from 960px. */
  nav: ReactNode;
  /** The app's navigation control in the header below 960px (a button that opens `nav`, say). */
  mobileNav?: ReactNode;
  /** Accessible name of the sidebar landmark, e.g. "Pipeline stages". */
  navLabel: string;
  /** Text of the skip link. */
  skipLabel?: string;
  children: ReactNode;
}

/**
 * The frame every app sits in. The app switcher and theme toggle are the
 * shell's; the app supplies its navigation and its page.
 *
 * From 960px (md): one screen, no page scroll. Navigation on the left, a
 * vertical rule, and the page in a large rounded panel on the right that
 * scrolls inside itself with its footer pinned to the bottom.
 *
 * Below 960px: a header with the switcher, the app's menu and the theme
 * toggle, and the panel flows with the page.
 */
export function AppShell({
  nav,
  mobileNav,
  navLabel,
  skipLabel = "Skip to content",
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-link focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {skipLabel}
      </a>

      <header className="sticky top-0 z-30 border-b border-border-subtle bg-background md:hidden">
        <div className="flex h-16 items-center gap-3 px-[max(16px,env(safe-area-inset-left))]">
          <AppSwitcher compact />
          <div className="ml-auto flex items-center gap-2">
            {mobileNav}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <aside
        aria-label={navLabel}
        className="hidden w-80 shrink-0 flex-col border-r-2 border-border-subtle md:flex"
      >
        <div className="flex h-18 shrink-0 items-center justify-between gap-2 px-6">
          <AppSwitcher />
          <ThemeToggle />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
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
