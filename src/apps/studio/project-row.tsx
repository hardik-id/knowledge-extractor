import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/services/contracts";
import { changedFact, configurationFact, documentsFact, openProjectHref } from "./project-facts";

interface ProjectRowProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

/** What the quiet icon buttons share: hidden until hover or focus, always shown on touch. */
const QUIET =
  "text-ink-muted opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 coarse:opacity-100";

/** One project: its name opens it; its facts and its edit and delete controls sit beside it. */
export function ProjectRow({ project, onEdit, onDelete }: ProjectRowProps) {
  return (
    <li className="group/row flex items-start justify-between gap-3 px-2 py-3 hover:bg-surface-hover sm:px-3">
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-body font-semibold">
          <Link
            href={openProjectHref(project)}
            className="rounded-control break-words text-link underline-offset-4 hover:underline"
          >
            {project.name}
          </Link>
        </h2>
        {project.description && (
          <p className="truncate text-body text-ink">{project.description}</p>
        )}
        <p className="text-caption text-ink-muted">
          {documentsFact(project)} · {configurationFact(project)} · Changed{" "}
          <time dateTime={project.updatedAt}>{changedFact(project)}</time>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className={QUIET}
          title="Edit"
          onClick={() => onEdit(project)}
        >
          <Pencil />
          <span className="sr-only">Edit {project.name}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={QUIET}
          title="Delete"
          onClick={() => onDelete(project)}
        >
          <Trash2 />
          <span className="sr-only">Delete {project.name}</span>
        </Button>
      </div>
    </li>
  );
}
