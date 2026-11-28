import { type APIRequestContext, expect } from "@playwright/test";
import { API_BASE_URL } from "./env";
import type { Person } from "./people";

/** The roles a person can have in a workspace. */
export type WorkspaceRole = "owner" | "editor" | "viewer";

const asPerson = (person: Person) => ({ authorization: `Bearer ${person.token}` });

/**
 * Gives `person` a role in the workspace, through the API, as `actor` (an owner of the workspace).
 * The person is asked who they are first: a person exists for the backend once they have signed
 * in, and only people who exist can be given a role. Calling it again changes the role.
 */
export async function giveRole(
  request: APIRequestContext,
  actor: Person,
  workspace: { id: string },
  person: Person,
  role: WorkspaceRole,
) {
  const me = await request.get(`${API_BASE_URL}/me`, { headers: asPerson(person) });
  expect(me.ok(), `GET /me as the new person answered ${me.status()}`).toBeTruthy();
  const { id } = (await me.json()) as { id: number | string };
  const put = await request.put(`${API_BASE_URL}/workspaces/${workspace.id}/members/${id}`, {
    headers: asPerson(actor),
    data: { role },
  });
  expect(put.ok(), `PUT member answered ${put.status()}: ${await put.text()}`).toBeTruthy();
}
