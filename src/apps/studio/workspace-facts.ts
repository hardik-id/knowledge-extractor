import { plural } from "@/lib/format";
import type { Workspace } from "@/services/contracts";
export function documentsFact(workspace: Pick<Workspace, "documentCount">): string {
  return plural(workspace.documentCount, "document");
}

export function configurationFact(workspace: Pick<Workspace, "configurationVersion">): string {
  return workspace.configurationVersion === null
    ? "No configuration yet"
    : `Configuration version ${workspace.configurationVersion}`;
}

const changedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-11-02T09:05:00Z" → "2 Nov 2026, 09:05" in the person's time zone. */
export function changedFact(workspace: Pick<Workspace, "updatedAt">): string {
  const date = new Date(workspace.updatedAt);
  return Number.isNaN(date.getTime()) ? "—" : changedFormat.format(date);
}

/** What goes with a workspace when it is deleted, for the confirmation. */
export function deletionConsequences(
  workspace: Pick<Workspace, "documentCount" | "configurationVersion">,
): string[] {
  return [
    workspace.documentCount > 0
      ? `The ${plural(workspace.documentCount, "document")} chosen for it (the files themselves stay where they are)`
      : "The documents chosen for it (none yet)",
    workspace.configurationVersion === null
      ? "Its configuration (none yet)"
      : `Its configuration (${plural(workspace.configurationVersion, "version")})`,
    "Its conversation with the assistant",
    "All the records extracted in it",
  ];
}
