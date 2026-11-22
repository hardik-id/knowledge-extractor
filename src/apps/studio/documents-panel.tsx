"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Info, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileBrowser, SelectionSummary } from "@/features/file-picker/file-browser";
import { isApiError } from "@/lib/api/api-error";
import { services } from "@/services";
import type { RunFile } from "@/services/contracts";
import { toastFailure } from "@/features/auth/report-failure";
import { sameDocuments } from "@/store/run-state";
import { usePipelineStore } from "@/store/pipeline-store";
import {
  WAIT_FOR_RUN,
  isRunBusy,
  removedFiles,
  removedWithReviewedRecords,
} from "./documents-change";
import { extractionHref } from "./nav-steps";
import { ProjectTopBar } from "./project-top-bar";

/**
 * Pick the project's documents. Nothing is sent while choosing: "Save
 * documents" or "Open in extraction" sends the selection to the project's run,
 * which keeps its configuration, conversation and the records of documents
 * that stay. Documents taken out lose their records, so when a person worked
 * on those records they are asked first.
 */
export function DocumentsPanel() {
  const router = useRouter();
  const count = usePipelineStore((s) => s.selectedFiles.length);
  const selectedFiles = usePipelineStore((s) => s.selectedFiles);
  const runFiles = usePipelineStore((s) => s.runFiles);
  const runId = usePipelineStore((s) => s.runId);
  const ensureRun = usePipelineStore((s) => s.ensureRun);
  const saving = usePipelineStore((s) => s.creatingRun);
  const projectId = usePipelineStore((s) => s.projectId);

  const changed = !sameDocuments(selectedFiles, runFiles);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  /** Documents with worked-on records that a pending save would remove, and where to go after. */
  const [asking, setAsking] = useState<{ lost: RunFile[]; open: boolean } | null>(null);

  /** Sends the selection. Returns whether it was saved. */
  const save = async (): Promise<boolean> => {
    setBusy(false);
    try {
      await ensureRun();
      return true;
    } catch (error) {
      if (isRunBusy(error)) setBusy(true);
      else {
        toastFailure("Couldn't save the documents", error);
      }
      return false;
    }
  };

  const confirmed = async (open: boolean) => {
    if (!(await save())) return;
    if (open) {
      if (projectId) router.push(extractionHref(projectId));
    } else {
      toast.success("Documents saved");
    }
  };

  /** Asks first when the change would remove records a person worked on. */
  const submit = async (open: boolean) => {
    setOpening(open);
    if (!changed) {
      if (open && projectId) router.push(extractionHref(projectId));
      return;
    }
    let lost: RunFile[] = [];
    const removed = removedFiles(runFiles, selectedFiles);
    if (runId && removed.length > 0) {
      setChecking(true);
      try {
        lost = await removedWithReviewedRecords(removed, async (file) => {
          try {
            return await services.extraction.getFileExtraction(runId, file.id);
          } catch (error) {
            if (isApiError(error) && error.code === "extraction_not_found") return null;
            throw error;
          }
        });
      } catch (error) {
        toastFailure("Couldn't check the documents", error);
        return;
      } finally {
        setChecking(false);
      }
    }
    if (lost.length > 0) {
      setAsking({ lost, open });
      return;
    }
    await confirmed(open);
  };

  const [opening, setOpening] = useState(false);
  const working = saving || checking;

  return (
    <section aria-labelledby="studio-documents-title" className="flex flex-1 flex-col md:min-h-0">
      <ProjectTopBar />
      <h1 id="studio-documents-title" className="sr-only">
        Documents
      </h1>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-2 sm:px-6">
        <SelectionSummary itemNoun="document" />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {count === 0 && (
            <p id="open-hint" className="text-small text-ink-muted sm:text-right">
              Select at least one document.
            </p>
          )}
          <Button
            variant="secondary"
            onClick={() => void submit(false)}
            disabled={count === 0 || !changed || working}
          >
            {working && !opening && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            )}
            {working && !opening ? "Saving…" : "Save documents"}
          </Button>
          <Button
            onClick={() => void submit(true)}
            disabled={count === 0 || working}
            aria-describedby={count === 0 ? "open-hint" : undefined}
          >
            {working && opening ? (
              <>
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
                Opening…
              </>
            ) : (
              <>
                Open in extraction
                <ArrowRight data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="relative min-w-0 flex-1 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-y-auto">
        {busy && (
          <Alert variant="warning" role="alert" className="mb-4">
            <Info aria-hidden />
            <AlertDescription>
              {WAIT_FOR_RUN}. Your selection is kept: save it once the extraction is done.
            </AlertDescription>
          </Alert>
        )}
        <FileBrowser
          sources={["storage"]}
          itemNoun="document"
          searchHint="Search by name or folder"
        />
      </div>

      <Dialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <DialogContent>
          <DialogHeader className="pr-8">
            <DialogTitle>Remove documents with reviewed records?</DialogTitle>
            <DialogDescription>
              You accepted, rejected, added or edited records in{" "}
              {asking?.lost.map((file) => file.name).join(", ")}. Removing{" "}
              {asking?.lost.length === 1 ? "this document" : "these documents"} removes{" "}
              {asking?.lost.length === 1 ? "its records" : "their records"} too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const open = asking?.open ?? false;
                setAsking(null);
                void confirmed(open);
              }}
            >
              Remove documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
