import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { MobileStageNav } from "@/components/layout/mobile-stage-nav";
import { StageSidebar } from "@/components/layout/stage-sidebar";
import { RunStoreProvider } from "@/store/run-store-context";
import { pipelineRunStore } from "@/store/pipeline-store";

// A page's own title (the stage label) is slotted into the template.
export const metadata: Metadata = {
  title: { default: "Knowledge Extractor", template: "%s · Knowledge Extractor" },
  description: "Select, ingest, transform, classify, enrich, extract and index documents.",
};

export default function PipelineLayout({ children }: LayoutProps<"/pipeline">) {
  return (
    <RunStoreProvider store={pipelineRunStore} firstHref="/pipeline/select">
      <AppShell
        nav={<StageSidebar />}
        mobileNav={<MobileStageNav />}
        navLabel="Pipeline stages"
        skipLabel="Skip to stage"
      >
        {children}
      </AppShell>
    </RunStoreProvider>
  );
}
