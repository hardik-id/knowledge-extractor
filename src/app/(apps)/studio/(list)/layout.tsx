import { AppShell } from "@/components/layout/app-shell";

/** The workspace list keeps the sidebar; a workspace's screens have their own top bar instead. */
export default function StudioListLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      nav={
        <p className="px-5 pt-1 pb-3 text-small text-ink-muted">
          Open a workspace, or start a new one.
        </p>
      }
      navLabel="Studio"
      skipLabel="Skip to content"
    >
      {children}
    </AppShell>
  );
}
