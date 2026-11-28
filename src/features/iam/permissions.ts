import type { Person, Workspace } from "@/services/contracts";

/** The API's permission names (`docs/permissions.md` in the backend). */
export type Permission =
  | "workspace.view"
  | "workspace.edit"
  | "workspace.run"
  | "workspace.manage"
  | "workspace.members.manage";

/**
 * May the person do this in this workspace? The answer is the API's own list for this person, so
 * the UI only stops offering what would be refused: the API still checks every request.
 * No workspace (not loaded yet) answers no.
 */
export function mayInWorkspace(
  workspace: Pick<Workspace, "permissions"> | null | undefined,
  permission: Permission,
): boolean {
  return workspace?.permissions.includes(permission) ?? false;
}

/** Only a platform admin may test the connections (`status.test`). Not known yet answers no. */
export function mayTestConnections(person: Pick<Person, "platformAdmin"> | null | undefined) {
  return person?.platformAdmin === true;
}
