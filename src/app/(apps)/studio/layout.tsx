import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StudioMobileNav, StudioNav } from "@/apps/studio/studio-nav";
import { RunStoreProvider } from "@/store/run-store-context";
import { studioRunStore } from "@/store/pipeline-store";

export const metadata: Metadata = {
  title: { default: "Knowledge Studio", template: "%s · Knowledge Studio" },
  description: "Extract and review knowledge from documents already in storage.",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <RunStoreProvider store={studioRunStore}>
      <AppShell
        // The navigation reads the address, which under a project is only known at request time.
        nav={
          <Suspense>
            <StudioNav />
          </Suspense>
        }
        mobileNav={
          <Suspense>
            <StudioMobileNav />
          </Suspense>
        }
        navLabel="Studio"
        skipLabel="Skip to content"
      >
        {children}
      </AppShell>
    </RunStoreProvider>
  );
}
