import { plural } from "@/lib/format";
import type { Project } from "@/services/contracts";
import { extractionHref, projectHref } from "./nav-steps";

/** Where opening a project goes: extraction once it has documents, otherwise Documents. */
export function openProjectHref(project: Pick<Project, "id" | "documentCount">): string {
  return project.documentCount > 0 ? extractionHref(project.id) : projectHref(project.id);
}

export function documentsFact(project: Pick<Project, "documentCount">): string {
  return plural(project.documentCount, "document");
}

export function configurationFact(project: Pick<Project, "configurationVersion">): string {
  return project.configurationVersion === null
    ? "No configuration yet"
    : `Configuration version ${project.configurationVersion}`;
}

const changedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-11-02T09:05:00Z" → "2 Nov 2026, 09:05" in the person's time zone. */
export function changedFact(project: Pick<Project, "updatedAt">): string {
  const date = new Date(project.updatedAt);
  return Number.isNaN(date.getTime()) ? "—" : changedFormat.format(date);
}

/** What goes with a project when it is deleted, for the confirmation. */
export function deletionConsequences(
  project: Pick<Project, "documentCount" | "configurationVersion">,
): string[] {
  return [
    project.documentCount > 0
      ? `The ${plural(project.documentCount, "document")} chosen for it (the files themselves stay where they are)`
      : "The documents chosen for it (none yet)",
    project.configurationVersion === null
      ? "Its configuration (none yet)"
      : `Its configuration (${plural(project.configurationVersion, "version")})`,
    "Its conversation with the assistant",
    "All the records extracted in it",
  ];
}
