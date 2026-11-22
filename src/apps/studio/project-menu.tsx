"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ChevronDown, Pencil, Text, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { services } from "@/services";
import { usePipelineStore } from "@/store/pipeline-store";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { STUDIO_HOME } from "./nav-steps";
import { ProjectFormDialog } from "./project-form-dialog";

type Dialog = "rename" | "description" | "delete";

/**
 * The open project's name as a menu: rename it, edit its description, delete it.
 * A rename shows at once (the store takes the saved project); a delete goes back to the list.
 */
export function ProjectMenu() {
  const router = useRouter();
  const project = usePipelineStore((s) => s.project);
  const setProject = usePipelineStore((s) => s.setProject);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!project) return null;

  const closeForm = (open: boolean) => !open && setDialog(null);
  const initial = { name: project.name, description: project.description };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            title={project.name}
            className="max-w-[min(24rem,60vw)] px-2 font-semibold text-ink-heading"
          >
            <span className="truncate">{project.name}</span>
            <ChevronDown aria-hidden className="text-ink-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("description")}>
            <Text aria-hidden />
            Edit description
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectFormDialog
        open={dialog === "rename" || dialog === "description"}
        onOpenChange={closeForm}
        title={dialog === "description" ? "Edit description" : "Rename project"}
        description="Its documents and records stay as they are."
        submitLabel="Save"
        busyLabel="Saving…"
        initial={initial}
        onSubmit={async (values) => {
          setProject(await services.projects.rename(project.id, values));
        }}
      />
      <DeleteProjectDialog
        project={dialog === "delete" ? project : null}
        onCancel={() => setDialog(null)}
        onDeleted={async (deleting) => {
          await services.projects.remove(deleting.id);
        }}
        // The project and its page are gone: the list is where the person goes next.
        onClosedAfterDelete={() => router.push(STUDIO_HOME)}
      />
    </>
  );
}
