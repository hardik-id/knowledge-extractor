import type { Metadata } from "next";
import { DocumentsPanel } from "@/apps/studio/documents-panel";

// The layout's title template only applies to pages below it, not to its own page.
export const metadata: Metadata = { title: { absolute: "Documents · Knowledge Studio" } };

export default function StudioDocumentsPage() {
  return <DocumentsPanel />;
}
