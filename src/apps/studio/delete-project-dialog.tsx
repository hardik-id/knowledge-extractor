"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import { deletionConsequences } from "./project-facts";

interface DeleteProjectDialogProps {
  /** The project to delete; null keeps the dialog closed. */
  project: Project | null;
  onCancel: () => void;
  /** Deletes it; rejects with the failure to show. The dialog closes when it resolves. */
  onDeleted: (project: Project) => Promise<void>;
  /** Called when the dialog has closed after a deletion, to put focus somewhere that still exists. */
  onClosedAfterDelete: () => void;
}

/** Names the project and says what goes with it before deleting. */
export function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const { project, onCancel } = props;
  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && onCancel()}>
      {project && <DeleteContent key={project.id} {...props} project={project} />}
    </Dialog>
  );
}

function DeleteContent({
  project,
  onCancel,
  onDeleted,
  onClosedAfterDelete,
}: DeleteProjectDialogProps & { project: Project }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleted = useRef(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDeleted(project);
      deleted.current = true;
      onCancel();
    } catch (failure) {
      setError(describeApiError(failure));
      setBusy(false);
    }
  };

  return (
    <DialogContent
      onCloseAutoFocus={(event) => {
        if (!deleted.current) return;
        event.preventDefault();
        onClosedAfterDelete();
      }}
    >
      <DialogHeader>
        <DialogTitle>Delete “{project.name}”?</DialogTitle>
        <DialogDescription>This can’t be undone. Deleting the project removes:</DialogDescription>
      </DialogHeader>
      <ul className="list-disc space-y-1 pl-5 text-[15px] leading-[22px]">
        {deletionConsequences(project).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-[13px] leading-[18px] text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          Keep project
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
          {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {busy ? "Deleting…" : "Delete project"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
