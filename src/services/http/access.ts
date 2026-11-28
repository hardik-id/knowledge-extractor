import type { HttpClient } from "@/lib/api";
import type { AccessApi } from "../access";
import {
  parseAccessPerson,
  parseActivityEntry,
  parsePage,
  parsePlatformAdmin,
  parsePlatformAdmins,
  parseTenant,
  parseTenantMember,
  parseTenants,
  parseTenantWorkspace,
  parseWorkspaceMember,
  parseWorkspaceMembers,
} from "./access-parsers";

const enc = encodeURIComponent;

/** The access services over the Django API (`docs/iam.md` there). Paths are relative to `/api/v1`. */
export function createHttpAccessApi(client: HttpClient): AccessApi {
  const send = async (method: "PUT" | "PATCH", path: string, body?: unknown): Promise<unknown> => {
    const response = await client.request(method, path, { body });
    return response.json().catch(() => undefined);
  };

  return {
    tenants: {
      list: async (signal) => parseTenants(await client.get("tenants", { signal })),
      create: async (name) => parseTenant(await client.post("tenants", { body: { name } })),
      rename: async (id, name) => parseTenant(await send("PATCH", `tenants/${enc(id)}`, { name })),
      remove: async (id) => {
        await client.delete(`tenants/${enc(id)}`);
      },
    },

    tenantMembers: {
      list: async (tenantId, { search, cursor, signal } = {}) =>
        parsePage(
          await client.get(`tenants/${enc(tenantId)}/members`, {
            query: { search, cursor },
            signal,
          }),
          "members",
          parseTenantMember,
        ),
      add: async (tenantId, { preferredUsername, role }) =>
        parseTenantMember(
          await client.post(`tenants/${enc(tenantId)}/members`, {
            body: { preferred_username: preferredUsername, role },
          }),
        ),
      setRole: async (tenantId, userId, role) =>
        parseTenantMember(
          await send("PUT", `tenants/${enc(tenantId)}/members/${enc(String(userId))}`, { role }),
        ),
      remove: async (tenantId, userId) => {
        await client.delete(`tenants/${enc(tenantId)}/members/${enc(String(userId))}`);
      },
    },

    tenantWorkspaces: {
      list: async (tenantId, { cursor, signal } = {}) =>
        parsePage(
          await client.get(`tenants/${enc(tenantId)}/workspaces`, { query: { cursor }, signal }),
          "workspaces",
          parseTenantWorkspace,
        ),
    },

    workspaceMembers: {
      list: async (workspaceId, signal) =>
        parseWorkspaceMembers(
          await client.get(`workspaces/${enc(workspaceId)}/members`, { signal }),
        ),
      setRole: async (workspaceId, userId, role) =>
        parseWorkspaceMember(
          await send("PUT", `workspaces/${enc(workspaceId)}/members/${enc(String(userId))}`, {
            role,
          }),
        ),
      remove: async (workspaceId, userId) => {
        await client.delete(`workspaces/${enc(workspaceId)}/members/${enc(String(userId))}`);
      },
    },

    people: {
      find: async (preferredUsername, signal) => {
        // A blank name is no query at all, and without one the API lists everyone.
        if (!preferredUsername.trim()) return null;
        const page = parsePage(
          await client.get("users", {
            query: { preferred_username: preferredUsername.trim() },
            signal,
          }),
          "users",
          parseAccessPerson,
        );
        return page.items[0] ?? null;
      },
      search: async ({ search, cursor, signal } = {}) =>
        parsePage(
          await client.get("users", { query: { search, cursor }, signal }),
          "users",
          parseAccessPerson,
        ),
    },

    platformAdmins: {
      list: async (signal) => parsePlatformAdmins(await client.get("platform-admins", { signal })),
      grant: async (userId) =>
        parsePlatformAdmin(await send("PUT", `platform-admins/${enc(String(userId))}`)),
      revoke: async (userId) => {
        await client.delete(`platform-admins/${enc(String(userId))}`);
      },
    },

    activity: {
      list: async ({ tenantId, cursor, signal } = {}) =>
        parsePage(
          await client.get("audit", { query: { tenant_id: tenantId, cursor }, signal }),
          "activity",
          parseActivityEntry,
        ),
    },
  };
}
