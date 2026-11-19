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

/** One project: its name opens it; its facts and its edit and delete controls sit beside it. */
export function ProjectRow({ project, onEdit, onDelete }: ProjectRowProps) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-[17px] leading-6 font-semibold">
          <Link
            href={openProjectHref(project)}
            className="rounded-sm break-words text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {project.name}
          </Link>
        </h2>
        {project.description && (
          <p className="max-w-[70ch] text-[15px] leading-[22px] break-words text-ink-muted">
            {project.description}
          </p>
        )}
        <p className="text-[13px] leading-[18px] text-ink-muted">
          {documentsFact(project)} · {configurationFact(project)} · Changed{" "}
          <time dateTime={project.updatedAt}>{changedFact(project)}</time>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(project)}>
          <Pencil data-icon="inline-start" />
          Edit
          <span className="sr-only"> {project.name}</span>
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(project)}>
          <Trash2 data-icon="inline-start" />
          Delete
          <span className="sr-only"> {project.name}</span>
        </Button>
      </div>
    </li>
  );
}
