import { AppShell } from "@/components/layout/app-shell";
import { RunStoreProvider } from "@/store/run-store-context";
import { pipelineRunStore } from "@/store/pipeline-store";

export default function PipelineLayout({ children }: LayoutProps<"/pipeline">) {
  return (
    <RunStoreProvider store={pipelineRunStore} firstHref="/pipeline/select">
      <AppShell>{children}</AppShell>
    </RunStoreProvider>
  );
}
