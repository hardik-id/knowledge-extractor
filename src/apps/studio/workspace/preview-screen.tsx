"use client";

import Link from "next/link";
import { CloudOff, FileSearch } from "lucide-react";
import { EmptyState } from "@/components/pipeline/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnSessionResumed, useSessionEnded } from "@/features/auth/use-session";
import { useExtractionRun } from "@/features/extraction/use-extraction-run";
import { isUnauthorized } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { projectHref } from "../nav-steps";
import { ProjectTopBar } from "../project-top-bar";
import { OneScreen } from "./one-screen";

/** Inside an open project (see ProjectScope): the working screen once its run has documents. */
export function PreviewScreen() {
  const projectId = usePipelineStore((s) => s.projectId);
  const hasDocuments = usePipelineStore((s) => s.runFiles.length > 0);
  const runLoad = usePipelineStore((s) => (s.runId ? s.runLoad : "ready"));
  const loadRun = usePipelineStore((s) => s.loadRun);
  const error = usePipelineStore((s) => s.runError);
  const sessionEnded = useSessionEnded();

  // The token was refused: the sign-in surface is up, and this loads again once the person is back.
  useOnSessionResumed(() => {
    if (runLoad === "error" && isUnauthorized(error)) void loadRun();
  });

  const waitingForSignIn = runLoad === "error" && isUnauthorized(error) && sessionEnded;
  if (!projectId || runLoad === "idle" || runLoad === "loading" || waitingForSignIn) {
    return (
      <div aria-busy="true" aria-label="Loading the working screen" className="space-y-3 px-5 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }
  if (!hasDocuments) {
    return (
      <>
        <ProjectTopBar />
        <div className="px-5 py-10 sm:px-8">
          <EmptyState
            icon={FileSearch}
            title="No documents opened yet"
            description="Choose the documents you want to extract from first."
            action={
              <Button asChild>
                <Link href={projectHref(projectId)}>Go to documents</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }
  if (runLoad === "error") {
    return (
      <>
        <ProjectTopBar />
        <div className="px-5 py-10 sm:px-8">
          <EmptyState
            icon={CloudOff}
            title="Couldn't load this workspace"
            description={describeApiError(error)}
            action={
              <Button variant="outline" onClick={() => void loadRun()}>
                Try again
              </Button>
            }
          />
        </div>
      </>
    );
  }
  return <Panel />;
}

function Panel() {
  const extraction = useExtractionRun("configuration");
  const project = usePipelineStore((s) => s.project);
  return (
    <section aria-label="Working screen" className="flex flex-1 flex-col md:min-h-0">
      <ProjectTopBar extraction={extraction} />
      <h1 className="sr-only">
        {project?.name ? `${project.name}: Working screen` : "Working screen"}
      </h1>
      <OneScreen extraction={extraction} />
    </section>
  );
}
