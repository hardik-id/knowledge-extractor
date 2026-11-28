"use client";

import { useState } from "react";
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
import type { TenantMember } from "@/services/access";

interface RemoveMemberDialogProps {
  /** The person to remove; null keeps the dialog closed. */
  member: TenantMember | null;
  tenantName: string;
  onCancel: () => void;
  /** Removes them. It handles its own failure: the dialog closes when it settles. */
  onConfirm: (member: TenantMember) => Promise<void>;
}

/** Asks first, and says that the person also loses their roles in the tenant's workspaces. */
export function RemoveMemberDialog({
  member,
  tenantName,
  onCancel,
  onConfirm,
}: RemoveMemberDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={member !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      {member && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle>
              Remove {member.user.name} from {tenantName}?
            </DialogTitle>
            <DialogDescription>
              They lose access to the tenant, and they also lose their roles in this tenant&apos;s
              workspaces.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Keep in tenant
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onConfirm(member).finally(() => {
                  setBusy(false);
                  onCancel();
                });
              }}
            >
              {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {busy ? "Removing…" : "Remove from tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
