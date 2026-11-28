import type { TenantRole, WorkspaceRole } from "./contracts";

/**
 * Who has access to what: a workspace's members, a tenant's members, tenants, platform admins and
 * the activity list. The rules and what each route needs are in the API's `docs/iam.md`; the UI's
 * own summary, with the error codes, is "Access" in `docs/studio-api.md`. The API decides and
 * refuses: these calls only carry the request. A page is `{ items, next }`: pass `next` back as
 * `cursor` for the following one.
 */

/** A person as the lists show them. `preferredUsername` is the exact sign-in name. */
export interface AccessPerson {
  id: number;
  name: string;
  preferredUsername: string;
}

/** A person named in an entry or an owner list: no sign-in name. */
export interface PersonRef {
  id: number;
  name: string;
}

export interface Page<T> {
  items: T[];
  /** An opaque cursor for the next page, or null on the last one. */
  next: string | null;
}

// ── Tenants ───────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  /** The person's role in the tenant; null for a platform admin who is not a member. */
  role: TenantRole | null;
  /** A number for a platform admin, null for anyone else. */
  memberCount: number | null;
  /** A number for a platform admin, null for anyone else. */
  workspaceCount: number | null;
}

/**
 * Codes the UI handles: `tenant_name_taken` (409, ignoring case), `default_tenant` (409, deleting
 * "Default"), `tenant_not_empty` (409, deleting a tenant that still has workspaces),
 * `tenant_not_found` (404), `forbidden` (403, a platform admin only), `validation_error` (422).
 */
export interface TenantsApi {
  /** The tenants the person belongs to; a platform admin gets every tenant, with counts. */
  list(signal?: AbortSignal): Promise<Tenant[]>;
  create(name: string): Promise<Tenant>;
  rename(tenantId: string, name: string): Promise<Tenant>;
  remove(tenantId: string): Promise<void>;
}

// ── A tenant's members ────────────────────────────────────────────────────

export interface TenantMember {
  user: AccessPerson;
  role: TenantRole;
  addedAt: string; // ISO-8601
}

export interface TenantMemberQuery {
  /** A part of the name or of the sign-in name. */
  search?: string;
  cursor?: string | null;
  signal?: AbortSignal;
}

/**
 * Anyone in the tenant may list; changing needs a tenant admin or a platform admin.
 * Codes the UI handles: `user_not_found` (404 on `add`: the sign-in name matches nobody who has
 * signed in; 404 on `setRole` and `remove` for someone who is not a member), `already_a_member`
 * (409), `last_tenant_admin` (409, not for a platform admin), `tenant_not_found` (404),
 * `forbidden` (403), `validation_error` (422).
 */
export interface TenantMembersApi {
  list(tenantId: string, query?: TenantMemberQuery): Promise<Page<TenantMember>>;
  /** Adds a person by the exact sign-in name. */
  add(
    tenantId: string,
    input: { preferredUsername: string; role: TenantRole },
  ): Promise<TenantMember>;
  setRole(tenantId: string, userId: number, role: TenantRole): Promise<TenantMember>;
  remove(tenantId: string, userId: number): Promise<void>;
}

// ── A tenant's workspaces ─────────────────────────────────────────────────

/** A workspace as a tenant's admin sees it: who and when, never its content. */
export interface TenantWorkspace {
  id: string;
  name: string;
  owners: PersonRef[];
  memberCount: number;
  noOwner: boolean;
  lastActivity: string; // ISO-8601
  createdAt: string; // ISO-8601
}

/** A tenant admin or a platform admin only (`forbidden` otherwise, `tenant_not_found` for a tenant the person doesn't see). */
export interface TenantWorkspacesApi {
  /** One page, last activity first. */
  list(
    tenantId: string,
    options?: { cursor?: string | null; signal?: AbortSignal },
  ): Promise<Page<TenantWorkspace>>;
}

// ── A workspace's members ─────────────────────────────────────────────────

export interface WorkspaceMember {
  user: AccessPerson;
  role: WorkspaceRole;
  addedAt: string; // ISO-8601
}

/**
 * Listing needs a role in the workspace, or being allowed to manage its members. Changing needs
 * an owner, an admin of the workspace's tenant or a platform admin (a person may always remove
 * themselves). Codes the UI handles: `not_a_tenant_member` (422, the person isn't in the
 * workspace's tenant), `last_owner` (409), `user_not_found` (404, removing someone who is not a
 * member), `workspace_not_found` (404), `forbidden` (403).
 */
export interface WorkspaceMembersApi {
  list(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceMember[]>;
  /** Gives the person a role: adds them, or changes their role. */
  setRole(workspaceId: string, userId: number, role: WorkspaceRole): Promise<WorkspaceMember>;
  remove(workspaceId: string, userId: number): Promise<void>;
}

// ── People ────────────────────────────────────────────────────────────────

/**
 * Only people who have signed in once are found. `forbidden` (403) for anyone who is not a tenant
 * admin (`find`) or a platform admin (`search`).
 */
export interface PeopleApi {
  /** The one person with exactly this sign-in name (case does not matter), or null. */
  find(preferredUsername: string, signal?: AbortSignal): Promise<AccessPerson | null>;
  /** Everyone who has signed in. A platform admin only. */
  search(options?: {
    search?: string;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<Page<AccessPerson>>;
}

// ── Platform admins ───────────────────────────────────────────────────────

export type PlatformAdminSource = "row" | "setting";

export interface PlatformAdmin {
  user: PersonRef;
  /** `row`: made in the app; `setting`: named in the server's settings and changed only there. */
  source: PlatformAdminSource;
}

/**
 * A platform admin only (`forbidden` otherwise). Codes the UI handles: `user_not_found` (404 on
 * `grant`: the person has never signed in), `last_platform_admin` (409), `platform_admin_by_setting`
 * (409 on `revoke`).
 */
export interface PlatformAdminsApi {
  list(signal?: AbortSignal): Promise<PlatformAdmin[]>;
  grant(userId: number): Promise<PlatformAdmin>;
  revoke(userId: number): Promise<void>;
}

// ── Activity ──────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  /** Text on purpose: the API adds actions (`tenant.role.set`, `workspace.member.remove`, ...). */
  action: string;
  /** Null once the person's record is gone. */
  actor: PersonRef | null;
  target: PersonRef | null;
  tenantId: string | null;
  workspaceId: string | null;
  oldRole: string | null;
  newRole: string | null;
  createdAt: string; // ISO-8601
}

/**
 * Every change of a role, newest first. With `tenantId`: a tenant admin or a platform admin
 * (`tenant_not_found` 404, `forbidden` 403). Without: a platform admin sees everything, a tenant
 * admin the tenants they administer, anyone else gets `forbidden`.
 */
export interface ActivityApi {
  list(options?: {
    tenantId?: string;
    cursor?: string | null;
    signal?: AbortSignal;
  }): Promise<Page<ActivityEntry>>;
}

export interface AccessApi {
  tenants: TenantsApi;
  tenantMembers: TenantMembersApi;
  tenantWorkspaces: TenantWorkspacesApi;
  workspaceMembers: WorkspaceMembersApi;
  people: PeopleApi;
  platformAdmins: PlatformAdminsApi;
  activity: ActivityApi;
}
