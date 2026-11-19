import { Suspense } from "react";
import { ProjectScope, ProjectSkeleton } from "@/apps/studio/project-scope";

/**
 * Every page of a project: the address names it, and the scope opens it.
 * The id is only known at request time and the project is fetched in the
 * browser, so its pages are not instant by design (`instant = false` on each).
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ProjectSkeleton />}>
      <ProjectScope>{children}</ProjectScope>
    </Suspense>
  );
}
