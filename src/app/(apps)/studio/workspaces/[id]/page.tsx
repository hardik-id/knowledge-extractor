import type { Metadata } from "next";
import { ExtractPageContent } from "@/apps/studio/extract-page-content";

// Opens once the workspace has loaded in the browser (see the workspace layout).
export const instant = false;

export const metadata: Metadata = { title: "Workspace" };

/** The picker while the workspace has no documents, then its working screen. */
export default function StudioWorkspacePage() {
  return <ExtractPageContent />;
}
