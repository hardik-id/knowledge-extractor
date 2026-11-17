import type { Metadata } from "next";
import { ExtractPageContent } from "@/apps/studio/extract-page-content";

export const metadata: Metadata = { title: "Extraction" };

export default function StudioExtractPage() {
  return <ExtractPageContent />;
}
