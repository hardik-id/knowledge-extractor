import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessFrame } from "@/apps/access/access-frame";
import { accessRunStore } from "@/apps/access/access-run-store";
import { AppShell } from "@/components/layout/app-shell";
import { RunStoreProvider } from "@/store/run-store-context";

export const metadata: Metadata = {
  title: { default: "Access", template: "%s · Access" },
  description: "Who is in a tenant and what they can do there.",
};

export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return (
    <RunStoreProvider store={accessRunStore}>
      <AppShell nav={null} navLabel="Access" skipLabel="Skip to content">
        {/* The frame reads the address (the chosen tenant), known at request time. */}
        <Suspense>
          <AccessFrame>{children}</AccessFrame>
        </Suspense>
      </AppShell>
    </RunStoreProvider>
  );
}
