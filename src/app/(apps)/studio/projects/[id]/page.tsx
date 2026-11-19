import type { Metadata } from "next";
import { DocumentsPanel } from "@/apps/studio/documents-panel";

// Opens once the project has loaded in the browser (see the project layout).
export const instant = false;

export const metadata: Metadata = { title: "Documents" };

export default function StudioDocumentsPage() {
  return <DocumentsPanel />;
}
