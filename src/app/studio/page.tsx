import type { Metadata } from "next";
import { DocumentsPanel } from "@/apps/studio/documents-panel";

export const metadata: Metadata = { title: "Documents" };

export default function StudioDocumentsPage() {
  return <DocumentsPanel />;
}
