"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sameDocuments, selectionFromRun } from "@/store/run-state";
import { usePipelineStore } from "@/store/pipeline-store";
import { DocumentsPicker } from "./documents-picker";

/**
 * Add or remove the project's documents from the workspace, in a sheet. Cancelling (or closing)
 * drops the choices made and goes back to the project's documents.
 */
export function DocumentsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const runFiles = usePipelineStore((s) => s.runFiles);
  const selectedFiles = usePipelineStore((s) => s.selectedFiles);
  const setSelection = usePipelineStore((s) => s.setSelection);

  /** The selection goes back to the project's documents. */
  const reset = () => {
    if (!sameDocuments(selectedFiles, runFiles)) setSelection(selectionFromRun(runFiles));
  };
  const change = (next: boolean) => {
    reset();
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-b border-border-subtle pr-12">
          <SheetTitle>Add or remove documents</SheetTitle>
          <SheetDescription>
            Documents you take out lose their records. The records of the others stay.
          </SheetDescription>
        </SheetHeader>
        <DocumentsPicker
          barAt="bottom"
          submitLabel="Save documents"
          workingLabel="Saving…"
          onSaved={() => {
            toast.success("Documents saved");
            onOpenChange(false);
          }}
          secondary={
            <Button variant="secondary" onClick={() => change(false)}>
              Cancel
            </Button>
          }
        />
      </SheetContent>
    </Sheet>
  );
}
