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
import type { Workspace } from "@/services/contracts";
import { isSessionEnd } from "@/features/auth/report-failure";
import { describeApiError } from "@/services/errors";
import { deletionConsequences } from "./workspace-facts";

interface DeleteWorkspaceDialogProps {
  /** The workspace to delete; null keeps the dialog closed. */
  workspace: Workspace | null;
  onCancel: () => void;
  /** Deletes it; rejects with the failure to show. The dialog closes when it resolves. */
  onDeleted: (workspace: Workspace) => Promise<void>;
  /** Called when the dialog has closed after a deletion, to put focus somewhere that still exists. */
  onClosedAfterDelete: () => void;
}

/** Names the workspace and says what goes with it before deleting. */
export function DeleteWorkspaceDialog(props: DeleteWorkspaceDialogProps) {
  const { workspace, onCancel } = props;
  return (
    <Dialog open={workspace !== null} onOpenChange={(open) => !open && onCancel()}>
      {workspace && <DeleteContent key={workspace.id} {...props} workspace={workspace} />}
    </Dialog>
  );
}

function DeleteContent({
  workspace,
  onCancel,
  onDeleted,
  onClosedAfterDelete,
}: DeleteWorkspaceDialogProps & { workspace: Workspace }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleted = useRef(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDeleted(workspace);
      deleted.current = true;
      onCancel();
    } catch (failure) {
      // A refused token is reported by the sign-in surface, not here.
      if (!isSessionEnd(failure)) setError(describeApiError(failure));
      setBusy(false);
    }
  };

  return (
    <DialogContent
      className="sm:max-w-md"
      onCloseAutoFocus={(event) => {
        if (!deleted.current) return;
        event.preventDefault();
        onClosedAfterDelete();
      }}
    >
      <DialogHeader className="pr-8">
        <DialogTitle>Delete “{workspace.name}”?</DialogTitle>
        <DialogDescription>This can’t be undone. Deleting the workspace removes:</DialogDescription>
      </DialogHeader>
      <ul className="list-disc space-y-1 pl-5 text-body">
        {deletionConsequences(workspace).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Keep workspace
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
          {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {busy ? "Deleting…" : "Delete workspace"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
