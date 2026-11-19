/** Knowledge Studio's addresses and its two steps. Pure, so the sidebar's rules can be tested. */

/** The entry: the person's projects. */
export const STUDIO_HOME = "/studio";

/** A project's Documents step. */
export function projectHref(projectId: string): string {
  return `${STUDIO_HOME}/projects/${encodeURIComponent(projectId)}`;
}

/** A project's extraction workspace. */
export function extractionHref(projectId: string): string {
  return `${projectHref(projectId)}/extract`;
}

const PROJECT_PATH = /^\/studio\/projects\/([^/]+)(\/.*)?$/;

/** The project an address belongs to, or null outside a project. */
export function projectIdFromPath(pathname: string): string | null {
  const match = PROJECT_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export type StudioStepId = "documents" | "extraction";

export interface StudioStep {
  id: StudioStepId;
  label: string;
  href: string;
  current: boolean;
  /** Extraction needs documents in the project. */
  disabled: boolean;
  /** Why it is disabled, for people and screen readers. */
  reason?: string;
}

/** The steps of the project the address belongs to; none outside a project. */
export function studioSteps(pathname: string, hasDocuments: boolean): StudioStep[] {
  const projectId = projectIdFromPath(pathname);
  if (projectId === null) return [];

  // What follows the project id: "" or "/" for Documents, "/extract…" for extraction.
  const rest = (PROJECT_PATH.exec(pathname)?.[2] ?? "").replace(/\/$/, "");
  const disabled = !hasDocuments;
  return [
    {
      id: "documents",
      label: "Documents",
      href: projectHref(projectId),
      current: rest === "",
      disabled: false,
    },
    {
      id: "extraction",
      label: "Extraction",
      href: extractionHref(projectId),
      current: rest === "/extract" || rest.startsWith("/extract/"),
      disabled,
      reason: disabled ? "Open documents in extraction first." : undefined,
    },
  ];
}
