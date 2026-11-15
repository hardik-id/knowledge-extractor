import { Brand } from "./brand";
import { MobileStageNav } from "./mobile-stage-nav";
import { ThemeToggle } from "./theme-toggle";

/** Below 960px only: brand, stage menu, theme toggle. From 960px these live in the sidebar. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-background md:hidden">
      <div className="flex h-16 items-center gap-3 px-[max(16px,env(safe-area-inset-left))]">
        <Brand compact />
        <div className="ml-auto flex items-center gap-2">
          <MobileStageNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
