import { Suspense, type ReactNode } from "react";
import { UserMenu } from "@/features/auth/user-menu";
import { BackendStatusBadge } from "@/features/status/status-badge";
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
 * From 960px (md): one screen, no page scroll. A slim sidebar (app switcher and theme on top,
 * the app's navigation, the user menu at the bottom), one hairline, and the page directly on
 * the ground. The page's own scrolling region sits under its header.
 *
 * Below 960px: a top bar with the switcher, the app's menu, the theme toggle and the user
 * menu, and the page scrolls as a whole.
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
        className="sr-only z-50 rounded-control bg-background px-4 py-2 text-link focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {skipLabel}
      </a>

      <header className="sticky top-0 z-30 border-b border-border-subtle bg-background md:hidden">
        <div className="flex h-14 items-center gap-3 px-[max(16px,env(safe-area-inset-left))]">
          {/* The switcher reads the address, only known at request time under a dynamic route. */}
          <Suspense>
            <AppSwitcher compact />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            {mobileNav}
            <BackendStatusBadge />
            <ThemeToggle />
            <UserMenu compact />
          </div>
        </div>
      </header>

      <aside
        aria-label={navLabel}
        className="hidden w-60 shrink-0 flex-col border-r border-border-subtle md:flex"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-1 px-3">
          <Suspense>
            <AppSwitcher />
          </Suspense>
          <ThemeToggle />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <div className="flex shrink-0 flex-col gap-1 border-t border-border-subtle p-2 empty:hidden">
          <BackendStatusBadge side="top" align="start" className="w-full justify-start" />
          <UserMenu />
        </div>
      </aside>

      <main id="main" className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <ConnectionBanner />
        <div className="flex flex-1 flex-col md:min-h-0">{children}</div>
      </main>
    </div>
  );
}
