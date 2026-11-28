import type { TenantRole, WorkspaceRole } from "../contracts";
import type {
  AccessPerson,
  ActivityEntry,
  Page,
  PersonRef,
  PlatformAdmin,
  PlatformAdminSource,
  Tenant,
  TenantMember,
  TenantWorkspace,
  WorkspaceMember,
} from "../access";
import { array, invalid, nullable, number, object, oneOf, string } from "./parsers";

/**
 * The wire format of the access routes (snake_case JSON) to the UI's types. As strict as the other
 * parsers: a role outside the fixed words, or a platform admin's `source` other than `row` or
 * `setting`, is refused. An activity entry's `action` is text, because the API adds to it.
 *
 *   tenant            { id, name, is_default, role: admin|member|null, member_count|null, workspace_count|null, created_at }
 *   user              { id, name, preferred_username }
 *   tenant member     { user, role, added_at }
 *   tenant workspace  { id, name, owners: [{ id, name }], member_count, no_owner, last_activity, created_at }
 *   workspace member  { user, role: owner|editor|viewer, added_at }
 *   platform admin    { user_id, name, source: row|setting }
 *   activity          { id, action, actor, target, tenant_id, workspace_id, old_role, new_role, created_at }
 *   page              { items, next }
 */

const TENANT_ROLES = ["admin", "member"] as const;
const WORKSPACE_ROLES = ["owner", "editor", "viewer"] as const;
const PLATFORM_ADMIN_SOURCES = ["row", "setting"] as const;

const nullableCount = (value: unknown, path: string): number | null =>
  nullable(value, (v) => number(v, path));

export function parseAccessPerson(value: unknown, path = "user"): AccessPerson {
  const o = object(value, path);
  return {
    id: number(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    preferredUsername: string(o.preferred_username, `${path}.preferred_username`),
  };
}

function parsePersonRef(value: unknown, path: string): PersonRef {
  const o = object(value, path);
  return { id: number(o.id, `${path}.id`), name: string(o.name, `${path}.name`) };
}

/** `{ items: [...], next }`: each item through `parseItem`. */
export function parsePage<T>(
  value: unknown,
  path: string,
  parseItem: (item: unknown, path: string) => T,
): Page<T> {
  const o = object(value, path);
  const next = o.next;
  if (next !== null && next !== undefined && typeof next !== "string") {
    invalid(`${path}.next`, "text or null");
  }
  return {
    items: array(o.items, `${path}.items`).map((item, i) => parseItem(item, `${path}.items[${i}]`)),
    next: next ?? null,
  };
}

export function parseTenant(value: unknown, path = "tenant"): Tenant {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    role: nullable(o.role, (v) => oneOf<TenantRole>(v, TENANT_ROLES, `${path}.role`)),
    memberCount: nullableCount(o.member_count, `${path}.member_count`),
    workspaceCount: nullableCount(o.workspace_count, `${path}.workspace_count`),
  };
}

/** `GET /tenants`: every item. The list is not paged (`next` is null). */
export function parseTenants(value: unknown): Tenant[] {
  return parsePage(value, "tenants", parseTenant).items;
}

export function parseTenantMember(value: unknown, path = "member"): TenantMember {
  const o = object(value, path);
  return {
    user: parseAccessPerson(o.user, `${path}.user`),
    role: oneOf<TenantRole>(o.role, TENANT_ROLES, `${path}.role`),
    addedAt: string(o.added_at, `${path}.added_at`),
  };
}

export function parseTenantWorkspace(value: unknown, path = "workspace"): TenantWorkspace {
  const o = object(value, path);
  const noOwner = o.no_owner;
  if (typeof noOwner !== "boolean") invalid(`${path}.no_owner`, "true or false");
  return {
    id: string(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    owners: array(o.owners, `${path}.owners`).map((owner, i) =>
      parsePersonRef(owner, `${path}.owners[${i}]`),
    ),
    memberCount: number(o.member_count, `${path}.member_count`),
    noOwner,
    lastActivity: string(o.last_activity, `${path}.last_activity`),
    createdAt: string(o.created_at, `${path}.created_at`),
  };
}

export function parseWorkspaceMember(value: unknown, path = "member"): WorkspaceMember {
  const o = object(value, path);
  return {
    user: parseAccessPerson(o.user, `${path}.user`),
    role: oneOf<WorkspaceRole>(o.role, WORKSPACE_ROLES, `${path}.role`),
    addedAt: string(o.added_at, `${path}.added_at`),
  };
}

/** `GET /workspaces/{id}/members`: `{ items }`, not paged. */
export function parseWorkspaceMembers(value: unknown): WorkspaceMember[] {
  const o = object(value, "members");
  return array(o.items, "members.items").map((item, i) =>
    parseWorkspaceMember(item, `members.items[${i}]`),
  );
}

export function parsePlatformAdmin(value: unknown, path = "platform admin"): PlatformAdmin {
  const o = object(value, path);
  return {
    user: { id: number(o.user_id, `${path}.user_id`), name: string(o.name, `${path}.name`) },
    source: oneOf<PlatformAdminSource>(o.source, PLATFORM_ADMIN_SOURCES, `${path}.source`),
  };
}

export function parsePlatformAdmins(value: unknown): PlatformAdmin[] {
  return parsePage(value, "platform admins", parsePlatformAdmin).items;
}

/** A role in an entry is text or nothing: an entry that is not about one carries an empty word. */
const roleWord = (value: unknown, path: string): string | null => {
  if (value === null || value === undefined) return null;
  const text = string(value, path);
  return text === "" ? null : text;
};

export function parseActivityEntry(value: unknown, path = "entry"): ActivityEntry {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    action: string(o.action, `${path}.action`),
    actor: nullable(o.actor, (v) => parsePersonRef(v, `${path}.actor`)),
    target: nullable(o.target, (v) => parsePersonRef(v, `${path}.target`)),
    tenantId: nullable(o.tenant_id, (v) => string(v, `${path}.tenant_id`)),
    workspaceId: nullable(o.workspace_id, (v) => string(v, `${path}.workspace_id`)),
    oldRole: roleWord(o.old_role, `${path}.old_role`),
    newRole: roleWord(o.new_role, `${path}.new_role`),
    createdAt: string(o.created_at, `${path}.created_at`),
  };
}
