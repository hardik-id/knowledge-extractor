"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { CloudOff, FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { useOnSessionResumed, useSessionEnded } from "@/features/auth/use-session";
import { isUnauthorized } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { STUDIO_HOME } from "./nav-steps";

/**
 * Opens the project the address names, and shows its pages once it and its
 * run have loaded. An unknown project, or someone else's, gets a screen that
 * says so, with the way back to the list.
 */
export function ProjectScope({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const hasHydrated = usePipelineStore((s) => s.hasHydrated);
  const openId = usePipelineStore((s) => s.projectId);
  const load = usePipelineStore((s) => s.projectLoad);
  const openProject = usePipelineStore((s) => s.openProject);
  const error = usePipelineStore((s) => s.projectError);
  const sessionEnded = useSessionEnded();

  // Again whenever the store lets go of it (another project, a sign-out).
  useEffect(() => {
    if (hasHydrated && openId !== id) void openProject(id);
  }, [hasHydrated, openId, id, openProject]);

  // The token was refused: the sign-in surface is up, and this loads again once the person is back.
  useOnSessionResumed(() => {
    if (openId === id && load === "error" && isUnauthorized(error)) void openProject(id);
  });

  const waitingForSignIn = load === "error" && isUnauthorized(error) && sessionEnded;
  if (openId !== id || load === "idle" || load === "loading" || waitingForSignIn) {
    return <ProjectSkeleton />;
  }

  if (load === "gone") {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={FolderX}
          title="This project no longer exists"
          description="It may have been deleted, or it belongs to someone else."
          action={
            <Button variant="outline" asChild>
              <Link href={STUDIO_HOME}>All projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (load === "error") {
    return (
      <div className="px-5 py-10 sm:px-8">
        <EmptyState
          icon={CloudOff}
          title="Couldn't load this project"
          description={describeApiError(error)}
          action={
            <Button variant="outline" onClick={() => void openProject(id)}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return children;
}

export function ProjectSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading project"
      className="space-y-6 px-5 py-6 sm:px-8"
    >
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
