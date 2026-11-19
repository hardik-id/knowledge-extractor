import type { Metadata } from "next";
import { ProjectsEntry } from "@/apps/studio/projects-entry";

// The layout's title template only applies to pages below it, not to its own page.
export const metadata: Metadata = { title: { absolute: "Projects · Knowledge Studio" } };

export default function StudioProjectsPage() {
  return <ProjectsEntry />;
}
