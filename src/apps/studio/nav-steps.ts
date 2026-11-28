/** Knowledge Studio's addresses. Pure, so they can be tested. */

/** The entry: the person's workspaces. */
export const STUDIO_HOME = "/studio";

/** A workspace: its documents picker until it has documents, then its working screen. */
export function workspaceHref(workspaceId: string): string {
  return `${STUDIO_HOME}/workspaces/${encodeURIComponent(workspaceId)}`;
}

const WORKSPACE_PATH = /^\/studio\/workspaces\/([^/]+)(\/.*)?$/;

/** The workspace an address belongs to, or null outside a workspace. */
export function workspaceIdFromPath(pathname: string): string | null {
  const match = WORKSPACE_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
