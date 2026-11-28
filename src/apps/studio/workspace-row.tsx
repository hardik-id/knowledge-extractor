import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/services/contracts";
import { workspaceHref } from "./nav-steps";
import { changedFact, configurationFact, documentsFact } from "./workspace-facts";

interface WorkspaceRowProps {
  workspace: Workspace;
  onEdit: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
}

/** What the quiet icon buttons share: hidden until hover or focus, always shown on touch. */
const QUIET =
  "text-ink-muted opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 coarse:opacity-100";

/** One workspace: its name opens it; its facts and its edit and delete controls sit beside it. */
export function WorkspaceRow({ workspace, onEdit, onDelete }: WorkspaceRowProps) {
  return (
    <li className="group/row flex items-start justify-between gap-3 px-2 py-3 hover:bg-surface-hover sm:px-3">
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-body font-semibold">
          <Link
            href={workspaceHref(workspace.id)}
            className="rounded-control break-words text-link underline-offset-4 hover:underline"
          >
            {workspace.name}
          </Link>
        </h2>
        {workspace.description && (
          <p className="truncate text-body text-ink">{workspace.description}</p>
        )}
        <p className="text-caption text-ink-muted">
          {documentsFact(workspace)} · {configurationFact(workspace)} · Changed{" "}
          <time dateTime={workspace.updatedAt}>{changedFact(workspace)}</time>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className={QUIET}
          title="Edit"
          onClick={() => onEdit(workspace)}
        >
          <Pencil />
          <span className="sr-only">Edit {workspace.name}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={QUIET}
          title="Delete"
          onClick={() => onDelete(workspace)}
        >
          <Trash2 />
          <span className="sr-only">Delete {workspace.name}</span>
        </Button>
      </div>
    </li>
  );
}
