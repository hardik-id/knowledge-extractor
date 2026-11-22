import type { Metadata } from "next";
import { ExtractPageContent } from "@/apps/studio/extract-page-content";

// Opens once the project has loaded in the browser (see the project layout).
export const instant = false;

export const metadata: Metadata = { title: "Project" };

/** The picker while the project has no documents, then its workspace. */
export default function StudioProjectPage() {
  return <ExtractPageContent />;
}
