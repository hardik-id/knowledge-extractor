"use client";

import Link from "next/link";
import { CloudOff, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { ExtractionWorkspace } from "@/features/extraction/extraction-workspace";
import { useAssistant, type AssistantState } from "@/features/extraction/use-assistant";
import { useExtractionRun, type ExtractionRun } from "@/features/extraction/use-extraction-run";
import { useExtractionInput } from "@/features/run/use-extraction-input";
import { MarkdownViewer } from "@/components/pipeline/markdown-viewer";
import { useOnSessionResumed, useSessionEnded } from "@/features/auth/use-session";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { useShallow } from "zustand/react/shallow";
import { plural } from "@/lib/format";
import { isUnauthorized } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { projectHref } from "./nav-steps";
import { ProjectTopBar } from "./project-top-bar";
import { StartPanel } from "./start/start-panel";

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
  const project = usePipelineStore((s) => s.project);
  const { saved, draft } = extraction.definition;
  const assistant = useAssistant(draft);
  // A new project: nothing saved, nothing drafted, nothing said to the assistant yet.
  const empty =
    !!saved && !!draft && saved.recordTypes.length === 0 && draft.recordTypes.length === 0;
  const starting = empty && assistant.messages.length === 0;
  return (
    <section aria-label="Extraction" className="flex flex-1 flex-col md:min-h-0">
      <ProjectTopBar extraction={extraction} />
      <h1 className="sr-only">{project?.name ? `${project.name}: Extraction` : "Extraction"}</h1>
      <div
        className="relative min-w-0 flex-1 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-y-auto"
        style={{ "--review-offset": "6rem" } as React.CSSProperties}
      >
        <FileProblems />
        {starting && assistant.isLoading ? (
          <ExtractSkeleton />
        ) : starting ? (
          <StartLayout extraction={extraction} assistant={assistant} />
        ) : (
          <ExtractionWorkspace
            extraction={extraction}
            definitionNote="This extraction configuration applies to this workspace only."
            versioned
          />
        )}
      </div>
    </section>
  );
}

/** The open document on the left, the ways to begin on the right (stacked on a phone). */
function StartLayout({
  extraction,
  assistant,
}: {
  extraction: ExtractionRun;
  assistant: AssistantState;
}) {
  const fileId = usePipelineStore(
    (s) => s.runFiles.find((f) => f.id === s.activeDocId)?.id ?? s.runFiles[0]?.id ?? null,
  );
  const input = useExtractionInput(fileId);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:items-start lg:gap-0">
      <div className="min-w-0 lg:pr-8" data-testid="start-document">
        {input.error !== undefined ? (
          <p role="alert" className="text-small text-danger">
            {describeApiError(input.error)}
          </p>
        ) : input.data ? (
          <MarkdownViewer markdown={input.data.text} className="mx-auto max-w-[680px]" />
        ) : (
          <div aria-busy="true" aria-label="Loading the document" className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </div>
      <aside
        aria-label="Start"
        className="min-w-0 border-t border-border-subtle pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
      >
        <StartPanel definition={extraction.definition} assistant={assistant} />
      </aside>
    </div>
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
