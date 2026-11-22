"use client";

import Link from "next/link";
import { CloudOff, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { ExtractionWorkspace } from "@/features/extraction/extraction-workspace";
import { useExtractionRun } from "@/features/extraction/use-extraction-run";
import { useOnSessionResumed, useSessionEnded } from "@/features/auth/use-session";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { useShallow } from "zustand/react/shallow";
import { plural } from "@/lib/format";
import { isUnauthorized } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { projectHref } from "./nav-steps";
import { ProjectTopBar } from "./project-top-bar";

/** Inside an open project (see ProjectScope): the workspace once its run has documents. */
export function ExtractPageContent() {
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
    return <ExtractSkeleton />;
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

  return <ExtractPanel />;
}

function ExtractPanel() {
  const extraction = useExtractionRun("configuration");
  return (
    <section aria-label="Extraction" className="flex flex-1 flex-col md:min-h-0">
      <ProjectTopBar extraction={extraction} />
      <div className="relative min-w-0 flex-1 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-y-auto">
        <FileProblems />
        <ExtractionWorkspace
          extraction={extraction}
          definitionNote="This extraction configuration applies to this workspace only."
          versioned
        />
      </div>
    </section>
  );
}

/** Only what needs attention: how many documents failed or are out of date. Nothing when all is well. */
function FileProblems() {
  const { failed, stale, firstError } = usePipelineStore(
    useShallow((s) => {
      const cells = s.runFiles.map((file) => s.cells[file.id]?.extract);
      return {
        failed: cells.filter((cell) => cell?.status === "failed").length,
        stale: cells.filter((cell) => cell?.status === "stale").length,
        firstError: cells.find((cell) => cell?.status === "failed")?.error?.message,
      };
    }),
  );
  if (failed === 0 && stale === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {failed > 0 && (
        <CellStatusLabel
          status="failed"
          label={`${plural(failed, "file")} failed`}
          title={firstError}
        />
      )}
      {stale > 0 && (
        <CellStatusLabel
          status="stale"
          label={`${plural(stale, "file")} out of date: an earlier stage ran again`}
        />
      )}
    </div>
  );
}

function ExtractSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading extraction" className="space-y-6 px-5 py-6 sm:px-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-lg" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
