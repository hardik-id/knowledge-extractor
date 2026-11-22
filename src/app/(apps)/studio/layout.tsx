import type { Metadata } from "next";
import { RunStoreProvider } from "@/store/run-store-context";
import { studioRunStore } from "@/store/pipeline-store";

export const metadata: Metadata = {
  title: { default: "Knowledge Studio", template: "%s · Knowledge Studio" },
  description: "Extract and review knowledge from documents already in storage.",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <RunStoreProvider store={studioRunStore}>{children}</RunStoreProvider>;
}
