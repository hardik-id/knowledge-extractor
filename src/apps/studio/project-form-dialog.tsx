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
import { Textarea } from "@/components/ui/textarea";
import { isSessionEnd } from "@/features/auth/report-failure";
import { describeApiError } from "@/services/errors";

export interface ProjectFormValues {
  name: string;
  description: string;
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  busyLabel: string;
  /** Starting values each time it opens. */
  initial: ProjectFormValues;
  /** Rejects with the failure to show; resolves to close the dialog. */
  onSubmit: (values: ProjectFormValues) => Promise<void>;
}

/** The name and description of a project, for making one and for changing one. */
export function ProjectFormDialog({ open, onOpenChange, ...rest }: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so it starts from `initial` every time. */}
        <ProjectForm onOpenChange={onOpenChange} {...rest} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  onOpenChange,
  title,
  description,
  submitLabel,
  busyLabel,
  initial,
  onSubmit,
}: Omit<ProjectFormDialogProps, "open">) {
  const nameId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [name, setName] = useState(initial.name);
  const [text, setText] = useState(initial.description);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), description: text.trim() });
      onOpenChange(false);
    } catch (failure) {
      // A refused token is reported by the sign-in surface, not here.
      if (!isSessionEnd(failure)) setError(describeApiError(failure));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={120}
          autoFocus
          required
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={descriptionId}>Description (optional)</Label>
        <Textarea
          id={descriptionId}
          value={text}
          rows={3}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] leading-[18px] text-danger">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {busy ? busyLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
