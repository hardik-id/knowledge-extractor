/** Knowledge Studio's addresses. Pure, so they can be tested. */

/** The entry: the person's projects. */
export const STUDIO_HOME = "/studio";

/** A project: its documents picker until it has documents, then its workspace. */
export function projectHref(projectId: string): string {
  return `${STUDIO_HOME}/projects/${encodeURIComponent(projectId)}`;
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
