"use client";

import { useState } from "react";
import { Info, LoaderCircle } from "lucide-react";
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
import { cn } from "@/lib/utils";
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

interface DocumentsPickerProps {
  /** The label of the one action, which sends the selection ("Use 2 documents", "Save documents"). */
  submitLabel: string;
  /** Shown while saving. */
  workingLabel: string;
  /** Called once the selection has been saved. */
  onSaved: () => void;
  /** Where the bar with the count and the actions sits: above the list or below it. */
  barAt?: "top" | "bottom";
  /** Next to the action, such as Cancel. */
  secondary?: React.ReactNode;
  className?: string;
}

/**
 * The document picker: the file browser, the count and the one action that sends the selection
 * to the workspace's run. The run keeps its configuration, conversation and the records of
 * documents that stay. Nothing is sent while choosing. Documents taken out lose their records,
 * so when a person worked on those records they are asked first.
 */
export function DocumentsPicker({
  submitLabel,
  workingLabel,
  onSaved,
  barAt = "top",
  secondary,
  className,
}: DocumentsPickerProps) {
  const count = usePipelineStore((s) => s.selectedFiles.length);
  const selectedFiles = usePipelineStore((s) => s.selectedFiles);
  const runFiles = usePipelineStore((s) => s.runFiles);
  const runId = usePipelineStore((s) => s.runId);
  const ensureRun = usePipelineStore((s) => s.ensureRun);
  const saving = usePipelineStore((s) => s.creatingRun);

  const changed = !sameDocuments(selectedFiles, runFiles);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  /** Documents with worked-on records that a pending save would remove. */
  const [asking, setAsking] = useState<RunFile[] | null>(null);

  /** Sends the selection, then reports it saved. */
  const save = async () => {
    setBusy(false);
    try {
      await ensureRun();
    } catch (error) {
      if (isRunBusy(error)) setBusy(true);
      else toastFailure("Couldn't save the documents", error);
      return;
    }
    onSaved();
  };

  /** Asks first when the change would remove records a person worked on. */
  const submit = async () => {
    if (!changed) {
      onSaved();
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
      setAsking(lost);
      return;
    }
    await save();
  };

  const working = saving || checking;
  const bar = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6",
        barAt === "top" ? "border-b border-border-subtle" : "border-t border-border-subtle",
      )}
    >
      <SelectionSummary itemNoun="document" />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {count === 0 && (
          <p id="use-hint" className="text-small text-ink-muted sm:text-right">
            Select at least one document.
          </p>
        )}
        {secondary}
        <Button
          onClick={() => void submit()}
          disabled={count === 0 || working}
          aria-describedby={count === 0 ? "use-hint" : undefined}
        >
          {working && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {working ? workingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {barAt === "top" && bar}
      <div
        className={cn(
          "relative min-w-0 flex-1 px-4 py-4 sm:px-6",
          // In the sheet the list scrolls on every width; on the screen the page scrolls on a phone.
          barAt === "bottom" ? "min-h-0 overflow-y-auto" : "md:min-h-0 md:overflow-y-auto",
        )}
      >
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
      {barAt === "bottom" && bar}

      <Dialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <DialogContent>
          <DialogHeader className="pr-8">
            <DialogTitle>Remove documents with reviewed records?</DialogTitle>
            <DialogDescription>
              You accepted, rejected, added or edited records in{" "}
              {asking?.map((file) => file.name).join(", ")}. Removing{" "}
              {asking?.length === 1 ? "this document" : "these documents"} removes{" "}
              {asking?.length === 1 ? "its records" : "their records"} too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAsking(null);
                void save();
              }}
            >
              Remove documents
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
