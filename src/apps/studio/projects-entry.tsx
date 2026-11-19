"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CloudOff, FolderOpen, LoaderCircle, Plus } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { useAsyncData } from "@/lib/use-async-data";
import { services } from "@/services";
import { describeApiError } from "@/services/errors";
import { projectHref } from "./nav-steps";
import { StudioPanel } from "./studio-panel";

/**
 * Studio's entry: the person's projects by name, and "New project". A plain
 * list until the project list proper exists.
 */
export function ProjectsEntry() {
  const projects = useAsyncData("projects", (signal) => services.projects.list(signal));

  return (
    <StudioPanel
      id="studio-projects"
      title="Projects"
      description="Each project keeps its documents, configuration, conversation and records."
      actions={<NewProjectButton />}
    >
      {projects.error ? (
        <EmptyState
          icon={CloudOff}
          title="Couldn't load your projects"
          description={describeApiError(projects.error)}
          action={
            <Button variant="outline" onClick={projects.retry}>
              Try again
            </Button>
          }
        />
      ) : !projects.data ? (
        <div aria-busy="true" aria-label="Loading projects" className="space-y-2">
          <Skeleton className="h-12 w-full max-w-xl" />
          <Skeleton className="h-12 w-full max-w-xl" />
        </div>
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Start a new project to choose documents and extract from them."
        />
      ) : (
        <ul aria-label="Your projects" className="flex max-w-xl flex-col gap-2">
          {projects.data.map((project) => (
            <li key={project.id}>
              <Link
                href={projectHref(project.id)}
                className="flex min-h-12 items-center rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-[17px] leading-6 font-semibold text-link transition-[border-color,box-shadow] hover:border-border-control hover:shadow-card"
              >
                <span className="truncate">{project.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StudioPanel>
  );
}

/** Asks for a name, makes the project and opens it. */
function NewProjectButton() {
  const router = useRouter();
  const nameId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (busy) return;
    setOpen(next);
    setName("");
    setError(null);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the project a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const project = await services.projects.create({ name: name.trim() });
      router.push(projectHref(project.id));
    } catch (failure) {
      setError(describeApiError(failure));
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => onOpenChange(true)}>
        <Plus data-icon="inline-start" />
        New project
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={(event) => void create(event)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>Name it after what you want to extract.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                maxLength={120}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error && (
                <p id={errorId} className="text-[13px] leading-[18px] text-danger">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
                {busy ? "Creating…" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
