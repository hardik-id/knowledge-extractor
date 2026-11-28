"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, FolderOpen, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/pipeline/empty-state";
import { useAsyncData } from "@/lib/use-async-data";
import type { Workspace } from "@/services/contracts";
import { services } from "@/services";
import { isSessionEnd } from "@/features/auth/report-failure";
import { describeApiError } from "@/services/errors";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { workspaceHref } from "./nav-steps";
import { WorkspaceFormDialog } from "./workspace-form-dialog";
import { WorkspaceRow } from "./workspace-row";
import { StudioPanel } from "./studio-panel";

/**
 * Studio's entry: the person's workspaces, last worked on first, with
 * "New workspace", rename and delete.
 *
 * Next.js keeps a page it leaves (hidden, with its state) and shows it again
 * on the way back, which would bring back the list as it was then: workspaces
 * worked on since in the wrong place, with old facts, or missing. So the list
 * starts over each time it is left, and is fetched again when it shows.
 */
export function WorkspacesEntry() {
  const [visit, setVisit] = useState(0);
  // The cleanup runs when the page is hidden, before the next one shows.
  useLayoutEffect(() => () => setVisit((n) => n + 1), []);
  return <WorkspaceList key={visit} />;
}

function WorkspaceList() {
  const router = useRouter();
  const firstPage = useAsyncData("workspaces", (signal) =>
    services.workspaces.listPage({ signal }),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Later pages, and what the person changed on this screen since the list loaded.
  const [more, setMore] = useState<{ items: Workspace[]; next: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, Workspace>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  const loaded = firstPage.data ? [...firstPage.data.items, ...(more?.items ?? [])] : null;
  const workspaces = loaded
    ?.filter((p) => !removed.has(p.id))
    .map((p) => edited[p.id] ?? p)
    // A renamed workspace is the latest changed one.
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const next = more ? more.next : (firstPage.data?.next ?? null);

  const showMore = async () => {
    if (next === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await services.workspaces.listPage({ cursor: next });
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
    workspaces !== undefined && workspaces !== null && workspaces.length === 0 && next === null;
  const newWorkspaceButton = (
    <Button size="lg" onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" />
      New workspace
    </Button>
  );

  return (
    <StudioPanel
      id="studio-workspaces"
      title="Workspaces"
      description="Each workspace keeps its documents, configuration, conversation and records."
      actions={newWorkspaceButton}
    >
      <div ref={listRef} tabIndex={-1} className="max-w-3xl outline-none">
        {firstPage.error ? (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load your workspaces"
            description={describeApiError(firstPage.error)}
            action={
              <Button variant="secondary" onClick={firstPage.retry}>
                Try again
              </Button>
            }
          />
        ) : !workspaces ? (
          <div role="status" aria-busy="true" aria-label="Loading workspaces" className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <FolderOpen aria-hidden className="size-6 text-ink-muted" />
            <div className="space-y-1">
              <h2>No workspaces yet</h2>
              <p className="max-w-[60ch] text-body text-ink-muted">
                A workspace holds the documents you choose, how to extract from them and the records
                that come out.
              </p>
            </div>
          </div>
        ) : (
          <>
            <ul
              aria-label="Your workspaces"
              className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle"
            >
              {workspaces.map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  workspace={workspace}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))}
            </ul>
            {next !== null && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <Button variant="secondary" disabled={loadingMore} onClick={() => void showMore()}>
                  {loadingMore && (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  )}
                  {loadingMore ? "Loading…" : "Show more"}
                </Button>
                {moreError && (
                  <p role="alert" className="text-small text-danger">
                    {moreError}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <WorkspaceFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New workspace"
        description="Name it after what you want to extract."
        submitLabel="Create workspace"
        busyLabel="Creating…"
        initial={{ name: "", description: "" }}
        creating
        onSubmit={async (values) => {
          const workspace = await services.workspaces.create(values);
          router.push(workspaceHref(workspace.id));
        }}
      />
      <WorkspaceFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit workspace"
        description="Change its name or description. Its documents and records stay as they are."
        submitLabel="Save"
        busyLabel="Saving…"
        initial={{ name: editing?.name ?? "", description: editing?.description ?? "" }}
        onSubmit={async (values) => {
          if (!editing) return;
          const saved = await services.workspaces.rename(editing.id, values);
          setEdited((current) => ({ ...current, [saved.id]: saved }));
        }}
      />
      <DeleteWorkspaceDialog
        workspace={deleting}
        onCancel={() => setDeleting(null)}
        onDeleted={async (workspace) => {
          await services.workspaces.remove(workspace.id);
          setRemoved((current) => new Set(current).add(workspace.id));
        }}
        onClosedAfterDelete={() => listRef.current?.focus()}
      />
    </StudioPanel>
  );
}
