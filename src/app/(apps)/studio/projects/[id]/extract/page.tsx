import type { Metadata } from "next";
import { ExtractPageContent } from "@/apps/studio/extract-page-content";

// Opens once the project has loaded in the browser (see the project layout).
export const instant = false;

export const metadata: Metadata = { title: "Extraction" };

export default function StudioExtractPage() {
  return <ExtractPageContent />;
}
