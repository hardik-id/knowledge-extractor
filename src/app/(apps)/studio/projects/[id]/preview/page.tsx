import type { Metadata } from "next";
import { PreviewScreen } from "@/apps/studio/workspace/preview-screen";

// Opens once the project has loaded in the browser (see the project layout).
export const instant = false;

export const metadata: Metadata = { title: "Working screen" };

export default function StudioPreviewPage() {
  return <PreviewScreen />;
}
