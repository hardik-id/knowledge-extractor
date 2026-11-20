"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, FolderOpen, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { useAsyncData } from "@/lib/use-async-data";
import type { Project } from "@/services/contracts";
import { services } from "@/services";
import { isSessionEnd } from "@/features/auth/report-failure";
import { describeApiError } from "@/services/errors";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { projectHref } from "./nav-steps";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectRow } from "./project-row";
import { StudioPanel } from "./studio-panel";

/**
 * Studio's entry: the person's projects, last worked on first, with
 * "New project", rename and delete.
 *
 * Next.js keeps a page it leaves (hidden, with its state) and shows it again
 * on the way back, which would bring back the list as it was then: projects
 * worked on since in the wrong place, with old facts, or missing. So the list
 * starts over each time it is left, and is fetched again when it shows.
 */
export function ProjectsEntry() {
  const [visit, setVisit] = useState(0);
  // The cleanup runs when the page is hidden, before the next one shows.
  useLayoutEffect(() => () => setVisit((n) => n + 1), []);
  return <ProjectList key={visit} />;
}

function ProjectList() {
  const router = useRouter();
  const firstPage = useAsyncData("projects", (signal) => services.projects.listPage({ signal }));
  const listRef = useRef<HTMLDivElement>(null);

  // Later pages, and what the person changed on this screen since the list loaded.
  const [more, setMore] = useState<{ items: Project[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, Project>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const loaded = firstPage.data ? [...firstPage.data.items, ...(more?.items ?? [])] : null;
  const projects = loaded
    ?.filter((p) => !removed.has(p.id))
    .map((p) => edited[p.id] ?? p)
    // A renamed project is the latest changed one.
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const next = more ? more.next : (firstPage.data?.next ?? null);

  const showMore = async () => {
    if (next === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await services.projects.listPage({ cursor: next });
      const known = new Set(
        [...(firstPage.data?.items ?? []), ...(more?.items ?? [])].map((p) => p.id),
      );
      setMore({
        items: [...(more?.items ?? []), ...page.items.filter((p) => !known.has(p.id))],
        next: page.next,
      });
    } catch (failure) {
      if (!isSessionEnd(failure)) setMoreError(describeApiError(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  const isEmpty =
    projects !== undefined && projects !== null && projects.length === 0 && next === null;
  const newProjectButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" />
      New project
    </Button>
  );

  return (
    <StudioPanel
      id="studio-projects"
      title="Projects"
      description="Each project keeps its documents, configuration, conversation and records."
      actions={isEmpty ? undefined : newProjectButton}
    >
      <div ref={listRef} tabIndex={-1} className="max-w-3xl outline-none">
        {firstPage.error ? (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load your projects"
            description={describeApiError(firstPage.error)}
            action={
              <Button variant="outline" onClick={firstPage.retry}>
                Try again
              </Button>
            }
          />
        ) : !projects ? (
          <div role="status" aria-busy="true" aria-label="Loading projects" className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="A project holds the documents you choose, how to extract from them, your conversation with the assistant and the records that come out."
            action={newProjectButton}
          />
        ) : (
          <>
            <ul aria-label="Your projects" className="flex flex-col gap-3">
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
            {next !== null && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <Button variant="outline" disabled={loadingMore} onClick={() => void showMore()}>
                  {loadingMore && (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  )}
                  {loadingMore ? "Loading…" : "Show more"}
                </Button>
                {moreError && (
                  <p role="alert" className="text-[13px] leading-[18px] text-danger">
                    {moreError}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ProjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New project"
        description="Name it after what you want to extract."
        submitLabel="Create project"
        busyLabel="Creating…"
        initial={{ name: "", description: "" }}
        onSubmit={async (values) => {
          const project = await services.projects.create(values);
          router.push(projectHref(project.id));
        }}
      />
      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit project"
        description="Change its name or description. Its documents and records stay as they are."
        submitLabel="Save"
        busyLabel="Saving…"
        initial={{ name: editing?.name ?? "", description: editing?.description ?? "" }}
        onSubmit={async (values) => {
          if (!editing) return;
          const saved = await services.projects.rename(editing.id, values);
          setEdited((current) => ({ ...current, [saved.id]: saved }));
        }}
      />
      <DeleteProjectDialog
        project={deleting}
        onCancel={() => setDeleting(null)}
        onDeleted={async (project) => {
          await services.projects.remove(project.id);
          setRemoved((current) => new Set(current).add(project.id));
        }}
        onClosedAfterDelete={() => listRef.current?.focus()}
      />
    </StudioPanel>
  );
}
