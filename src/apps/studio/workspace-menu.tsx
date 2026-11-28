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
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { STUDIO_HOME } from "./nav-steps";
import { WorkspaceFormDialog } from "./workspace-form-dialog";

type Dialog = "rename" | "description" | "delete";

/**
 * The open workspace's name as a menu: rename it, edit its description, delete it.
 * A rename shows at once (the store takes the saved workspace); a delete goes back to the list.
 */
export function WorkspaceMenu() {
  const router = useRouter();
  const workspace = usePipelineStore((s) => s.workspace);
  const setWorkspace = usePipelineStore((s) => s.setWorkspace);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!workspace) return null;

  const closeForm = (open: boolean) => !open && setDialog(null);
  const initial = { name: workspace.name, description: workspace.description };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            title={workspace.name}
            className="max-w-[min(9rem,60vw)] px-2 font-semibold text-ink-heading"
          >
            <span className="truncate">{workspace.name}</span>
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

      <WorkspaceFormDialog
        open={dialog === "rename" || dialog === "description"}
        onOpenChange={closeForm}
        title={dialog === "description" ? "Edit description" : "Rename workspace"}
        description="Its documents and records stay as they are."
        submitLabel="Save"
        busyLabel="Saving…"
        initial={initial}
        onSubmit={async (values) => {
          setWorkspace(await services.workspaces.rename(workspace.id, values));
        }}
      />
      <DeleteWorkspaceDialog
        workspace={dialog === "delete" ? workspace : null}
        onCancel={() => setDialog(null)}
        onDeleted={async (deleting) => {
          await services.workspaces.remove(deleting.id);
        }}
        // The workspace and its page are gone: the list is where the person goes next.
        onClosedAfterDelete={() => router.push(STUDIO_HOME)}
      />
    </>
  );
}
