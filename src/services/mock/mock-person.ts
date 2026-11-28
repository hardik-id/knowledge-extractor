import type { Person } from "../contracts";

/** The mock's one tenant, as the backend's "Default". */
export const MOCK_TENANT = { id: "tenant_default", name: "Default" } as const;

/**
 * The person in mock mode: a member of "Default" and a platform admin, so nothing is hidden. The
 * owner of every workspace (`OWNER_PERMISSIONS` are what the API gives an owner).
 */
export const MOCK_PERSON: Person = {
  id: 1,
  name: "Mock person",
  preferredUsername: "mock.person@example.com",
  platformAdmin: true,
  tenants: [{ ...MOCK_TENANT, role: "member" }],
};

export const OWNER_PERMISSIONS: readonly string[] = [
  "workspace.edit",
  "workspace.manage",
  "workspace.members.manage",
  "workspace.run",
  "workspace.view",
];
