"use client";

import { useMemo, useState } from "react";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { useExtractionRun } from "@/features/extraction/use-extraction-run";
import { useOnSessionResumed, useSessionEnded } from "@/features/auth/use-session";
import { CellStatusLabel } from "@/components/pipeline/cell-status-label";
import { useShallow } from "zustand/react/shallow";
import { plural } from "@/lib/format";
import { isUnauthorized } from "@/lib/api/api-error";
import { describeApiError } from "@/services/errors";
import { usePipelineStore } from "@/store/pipeline-store";
import { DocumentsScreen } from "./documents-screen";
import { WorkspaceTopBar } from "./workspace-top-bar";
import { OneScreen } from "./working-screen/one-screen";
import {
  ScreenControlsContext,
  WIDE_QUERY,
  type ScreenControls,
  type ScreenView,
} from "./working-screen/screen-state";

/** Inside an open workspace (see WorkspaceScope): the working screen once its run has documents, the picker before. */
export function ExtractPageContent() {
  const workspaceId = usePipelineStore((s) => s.workspaceId);
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
  if (!workspaceId || runLoad === "idle" || runLoad === "loading" || waitingForSignIn) {
    return <ExtractSkeleton />;
  }

  if (runLoad === "error") {
    return (
      <>
        <WorkspaceTopBar />
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

  // Only a run that loaded and is empty shows the picker: a failed load must never offer it.
  if (!hasDocuments) return <DocumentsScreen />;

  return <ExtractPanel />;
}

function ExtractPanel() {
  const extraction = useExtractionRun("configuration");
  const workspace = usePipelineStore((s) => s.workspace);
  const [view, setView] = useState<ScreenView>("document");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [assistantRequested, setAssistantRequested] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [chunkingOpen, setChunkingOpen] = useState(false);
  const controls = useMemo<ScreenControls>(
    () => ({
      view,
      setView,
      fieldsOpen,
      setFieldsOpen,
      assistantRequested,
      // Below 1100px the column is an overlay: it opens first.
      requestAssistant: () => {
        if (!window.matchMedia(WIDE_QUERY).matches) setFieldsOpen(true);
        setAssistantRequested(true);
      },
      answerAssistantRequest: () => setAssistantRequested(false),
      stripCollapsed,
      setStripCollapsed,
      chunkingOpen,
      setChunkingOpen,
    }),
    [view, fieldsOpen, assistantRequested, stripCollapsed, chunkingOpen],
  );
  return (
    <ScreenControlsContext.Provider value={controls}>
      <section aria-label="Extraction" className="flex flex-1 flex-col md:min-h-0">
        <WorkspaceTopBar extraction={extraction} />
        <h1 className="sr-only">
          {workspace?.name ? `${workspace.name}: Extraction` : "Extraction"}
        </h1>
        <FileProblems />
        <OneScreen extraction={extraction} />
      </section>
    </ScreenControlsContext.Provider>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-2">
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
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading extraction"
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
