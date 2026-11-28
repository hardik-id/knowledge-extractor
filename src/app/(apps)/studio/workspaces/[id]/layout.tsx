import { Suspense } from "react";
import { WorkspaceScope, WorkspaceSkeleton } from "@/apps/studio/workspace-scope";
import { WorkspaceShell } from "@/apps/studio/workspace-shell";

/**
 * Every page of a workspace: the address names it, and the scope opens it.
 * The id is only known at request time and the workspace is fetched in the
 * browser, so its pages are not instant by design (`instant = false` on each).
 * The shell has no sidebar: each page brings the workspace's top bar.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceShell>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <WorkspaceScope>{children}</WorkspaceScope>
      </Suspense>
    </WorkspaceShell>
  );
}
