import type { Metadata } from "next";
import { WorkspacesEntry } from "@/apps/studio/workspaces-entry";

// The layout's title template only applies to pages below it, not to its own page.
export const metadata: Metadata = { title: { absolute: "Workspaces · Knowledge Studio" } };

export default function StudioWorkspacesPage() {
  return <WorkspacesEntry />;
}
