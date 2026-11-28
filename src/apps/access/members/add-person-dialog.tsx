"use client";

import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { isSessionEnd } from "@/features/auth/report-failure";
import { services } from "@/services";
import type { TenantRole } from "@/services/contracts";
import { describeApiError } from "@/services/errors";
import type { Tenant } from "@/services/access";
import { ROLE_LABEL, TENANT_ROLES } from "./member-rules";

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: Tenant;
  /** The person was added: read the list again. */
  onAdded: () => void;
}

/** Adds a person to the tenant by the exact sign-in name, with a role (Member to start). */
export function AddPersonDialog({ open, onOpenChange, ...rest }: AddPersonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so it starts empty every time. */}
        <AddPersonForm onOpenChange={onOpenChange} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function AddPersonForm({ onOpenChange, tenant, onAdded }: Omit<AddPersonDialogProps, "open">) {
  const nameId = useId();
  const roleId = useId();
  const errorId = useId();
  const [preferredUsername, setPreferredUsername] = useState("");
  const [role, setRole] = useState<TenantRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const name = preferredUsername.trim();
    if (!name) {
      setError("Enter the person's sign-in name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await services.access.tenantMembers.add(tenant.id, { preferredUsername: name, role });
      onAdded();
      onOpenChange(false);
    } catch (failure) {
      // A refused token is reported by the sign-in surface, not here.
      if (!isSessionEnd(failure)) setError(describeApiError(failure));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <DialogHeader className="pr-8">
        <DialogTitle>Add person</DialogTitle>
        <DialogDescription>
          Add someone to {tenant.name} by their exact sign-in name. They need to have signed in
          once.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Sign-in name</Label>
        <Input
          id={nameId}
          value={preferredUsername}
          placeholder="ada@acme.com"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setPreferredUsername(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={roleId}>Role</Label>
        <Select
          id={roleId}
          value={role}
          onChange={(event) => setRole(event.target.value as TenantRole)}
        >
          {TENANT_ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option]}
            </option>
          ))}
        </Select>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {busy ? "Adding…" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}
