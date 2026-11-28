import { ApiError } from "@/lib/api/api-error";
import type { TenantRole, Workspace, WorkspaceRole } from "../contracts";
import type {
  AccessApi,
  AccessPerson,
  ActivityEntry,
  Page,
  PersonRef,
  PlatformAdmin,
  Tenant,
  TenantMember,
  TenantWorkspace,
  WorkspaceMember,
} from "../access";
import { MOCK_PERSON, MOCK_TENANT } from "./mock-person";

/**
 * The access services in memory: the tenant "Default", the mock person as its admin and as a
 * platform admin, and five made-up people. It keeps what is changed (until the page is closed),
 * follows the rules of the API with its codes, and adds an activity entry for each change. The
 * mock has no platform admin by setting.
 */

const MAX_NAME_LENGTH = 120;
const PAGE_SIZE = 50;

const ME: AccessPerson = {
  id: MOCK_PERSON.id,
  name: MOCK_PERSON.name,
  preferredUsername: MOCK_PERSON.preferredUsername,
};

/** The made-up people. Priya, Tom and Lena are in "Default"; Samir and Yuki have signed in and are in no tenant. */
const PEOPLE: AccessPerson[] = [
  ME,
  { id: 2, name: "Priya Nair", preferredUsername: "priya.nair@example.com" },
  { id: 3, name: "Tom Becker", preferredUsername: "tom.becker@example.com" },
  { id: 4, name: "Lena Moreau", preferredUsername: "lena.moreau@example.com" },
  { id: 5, name: "Samir Haddad", preferredUsername: "samir.haddad@example.com" },
  { id: 6, name: "Yuki Tanaka", preferredUsername: "yuki.tanaka@example.com" },
];

/** What every workspace starts with: the mock person owns it, two others have a lesser role. */
const SEED_WORKSPACE_ROLES: [number, WorkspaceRole][] = [
  [1, "owner"],
  [2, "editor"],
  [3, "viewer"],
];

const error = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message });

const validation = (message: string) => error(422, "validation_error", message);
const userNotFound = () =>
  error(404, "user_not_found", "No one with this sign-in name has signed in.");
const tenantNotFound = () => error(404, "tenant_not_found", "This tenant does not exist.");

interface TenantRecord {
  id: string;
  name: string;
  isDefault: boolean;
  members: Map<number, { role: TenantRole; addedAt: string }>;
}

interface WorkspaceRecord {
  members: Map<number, { role: WorkspaceRole; addedAt: string }>;
}

/** The workspaces the mock backend has: the access mock reads them, it does not keep them. */
export interface MockWorkspaceSource {
  list(): Promise<Workspace[]>;
  get(workspaceId: string): Promise<Workspace>;
}

export interface MockAccessOptions {
  workspaces?: MockWorkspaceSource;
  /** Whether the person acting is a platform admin (the mock person is). Default: true. */
  platformAdmin?: boolean;
  pageSize?: number;
}

const roleRank: Record<string, number> = { owner: 0, admin: 0, editor: 1, member: 1, viewer: 2 };

function checkName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw validation("A tenant needs a name.");
  if (name.length > MAX_NAME_LENGTH) {
    throw validation(`A tenant's name is at most ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

export class MockAccess {
  private readonly pageSize: number;
  private readonly source: MockWorkspaceSource;
  private readonly platformAdminActing: boolean;
  private tenants = new Map<string, TenantRecord>();
  private platformAdmins = new Set<number>([ME.id]);
  private workspaces = new Map<string, WorkspaceRecord>();
  /** Workspaces that belong to a tenant other than "Default" (a seam for the mock's own tests). */
  private tenantOfWorkspace = new Map<string, string>();
  private activityLog: ActivityEntry[] = [];
  private counter = 0;

  constructor({ workspaces, platformAdmin = true, pageSize = PAGE_SIZE }: MockAccessOptions = {}) {
    this.source = workspaces ?? {
      list: async () => [],
      get: async () => {
        throw error(404, "workspace_not_found", "This workspace does not exist.");
      },
    };
    this.platformAdminActing = platformAdmin;
    this.pageSize = pageSize;
    const addedAt = new Date().toISOString();
    this.tenants.set(MOCK_TENANT.id, {
      id: MOCK_TENANT.id,
      name: MOCK_TENANT.name,
      isDefault: true,
      members: new Map<number, { role: TenantRole; addedAt: string }>([
        [1, { role: "admin", addedAt }],
        [2, { role: "admin", addedAt }],
        [3, { role: "member", addedAt }],
        [4, { role: "member", addedAt }],
      ]),
    });
  }

  /** Puts a workspace in a tenant other than "Default". Only the mock's own tests need it. */
  assignWorkspace(workspaceId: string, tenantId: string): void {
    this.tenantOfWorkspace.set(workspaceId, tenantId);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private person(id: number): AccessPerson | undefined {
    return PEOPLE.find((p) => p.id === id);
  }

  private ref(id: number): PersonRef {
    const p = this.person(id);
    return { id, name: p?.name ?? `Person ${id}` };
  }

  private tenant(tenantId: string): TenantRecord {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw tenantNotFound();
    return tenant;
  }

  private record(entry: Omit<ActivityEntry, "id" | "actor" | "createdAt">): void {
    this.counter += 1;
    this.activityLog.unshift({
      id: `activity_${this.counter}`,
      actor: this.ref(ME.id),
      createdAt: new Date().toISOString(),
      ...entry,
    });
  }

  private tenantIdOf(workspaceId: string): string {
    return this.tenantOfWorkspace.get(workspaceId) ?? MOCK_TENANT.id;
  }

  /** The ids of the tenant's workspaces: the backend's, for "Default", and the ones assigned. */
  private async workspaceIdsOf(tenantId: string): Promise<string[]> {
    const ids = (await this.source.list()).map((w) => w.id);
    for (const id of this.tenantOfWorkspace.keys()) if (!ids.includes(id)) ids.push(id);
    return ids.filter((id) => this.tenantIdOf(id) === tenantId);
  }

  /** A workspace's members, seeded the first time it is asked for. A workspace that does not exist is a 404. */
  private async workspace(workspaceId: string): Promise<WorkspaceRecord> {
    const known = this.workspaces.get(workspaceId);
    if (known) return known;
    if (!this.tenantOfWorkspace.has(workspaceId)) await this.source.get(workspaceId);
    const addedAt = new Date().toISOString();
    const tenant = this.tenant(this.tenantIdOf(workspaceId));
    const created: WorkspaceRecord = {
      members: new Map(
        SEED_WORKSPACE_ROLES.filter(([id]) => tenant.members.has(id)).map(([id, role]) => [
          id,
          { role, addedAt },
        ]),
      ),
    };
    this.workspaces.set(workspaceId, created);
    return created;
  }

  private page<T>(all: T[], cursor?: string | null): Page<T> {
    const start = cursor ? Number.parseInt(cursor, 10) : 0;
    if (!Number.isInteger(start) || start < 0) throw validation("The cursor is not valid.");
    const end = start + this.pageSize;
    return { items: all.slice(start, end), next: end < all.length ? String(end) : null };
  }

  private admins(tenant: TenantRecord): number[] {
    return [...tenant.members].filter(([, m]) => m.role === "admin").map(([id]) => id);
  }

  /** A tenant keeps one admin, unless a platform admin makes the change. */
  private checkLastAdmin(tenant: TenantRecord, userId: number): void {
    if (this.platformAdminActing) return;
    const admins = this.admins(tenant);
    if (admins.length === 1 && admins[0] === userId) {
      throw error(409, "last_tenant_admin", "A tenant needs at least one admin.");
    }
  }

  private forbidden(): ApiError {
    return error(403, "forbidden", "You are not allowed to do this.");
  }

  /** Only a platform admin may do this. */
  private needPlatformAdmin(): void {
    if (!this.platformAdminActing) throw this.forbidden();
  }

  /** Only a platform admin or an admin of this tenant may do this. */
  private needTenantAdmin(tenant: TenantRecord): void {
    if (this.platformAdminActing) return;
    if (tenant.members.get(ME.id)?.role !== "admin") throw this.forbidden();
  }

  private tenantView(tenant: TenantRecord, workspaceCount: number): Tenant {
    return {
      id: tenant.id,
      name: tenant.name,
      role: tenant.members.get(ME.id)?.role ?? null,
      memberCount: this.platformAdminActing ? tenant.members.size : null,
      workspaceCount: this.platformAdminActing ? workspaceCount : null,
    };
  }

  private memberView(tenant: TenantRecord, userId: number): TenantMember {
    const member = tenant.members.get(userId)!;
    return { user: this.person(userId)!, role: member.role, addedAt: member.addedAt };
  }

  // ── the services ─────────────────────────────────────────────────────────

  readonly api: AccessApi = {
    tenants: {
      list: async () => {
        const all = [...this.tenants.values()]
          .filter((t) => this.platformAdminActing || t.members.has(ME.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        return Promise.all(
          all.map(async (t) => this.tenantView(t, (await this.workspaceIdsOf(t.id)).length)),
        );
      },
      create: async (name) => {
        this.needPlatformAdmin();
        const checked = checkName(name);
        this.checkNameFree(checked);
        const id = `tenant_${this.tenants.size + 1}_${Date.now().toString(36)}`;
        this.tenants.set(id, { id, name: checked, isDefault: false, members: new Map() });
        this.record({
          action: "tenant.create",
          target: null,
          tenantId: id,
          workspaceId: null,
          oldRole: null,
          newRole: null,
        });
        return this.tenantView(this.tenants.get(id)!, 0);
      },
      rename: async (tenantId, name) => {
        this.needPlatformAdmin();
        const tenant = this.tenant(tenantId);
        const checked = checkName(name);
        this.checkNameFree(checked, tenant.id);
        if (checked !== tenant.name) {
          tenant.name = checked;
          this.record({
            action: "tenant.rename",
            target: null,
            tenantId,
            workspaceId: null,
            oldRole: null,
            newRole: null,
          });
        }
        return this.tenantView(tenant, (await this.workspaceIdsOf(tenantId)).length);
      },
      remove: async (tenantId) => {
        this.needPlatformAdmin();
        const tenant = this.tenant(tenantId);
        if (tenant.isDefault) {
          throw error(409, "default_tenant", "The default tenant can't be deleted.");
        }
        if ((await this.workspaceIdsOf(tenantId)).length > 0) {
          throw error(409, "tenant_not_empty", "This tenant still has workspaces.");
        }
        for (const userId of tenant.members.keys()) {
          this.record({
            action: "tenant.member.remove",
            target: this.ref(userId),
            tenantId,
            workspaceId: null,
            oldRole: tenant.members.get(userId)!.role,
            newRole: null,
          });
        }
        this.tenants.delete(tenantId);
        this.record({
          action: "tenant.delete",
          target: null,
          tenantId,
          workspaceId: null,
          oldRole: null,
          newRole: null,
        });
      },
    },

    tenantMembers: {
      list: async (tenantId, { search, cursor } = {}) => {
        const tenant = this.tenant(tenantId);
        const needle = search?.trim().toLowerCase();
        const members = [...tenant.members.keys()]
          .map((id) => this.memberView(tenant, id))
          .filter(
            (m) =>
              !needle ||
              m.user.name.toLowerCase().includes(needle) ||
              m.user.preferredUsername.toLowerCase().includes(needle),
          )
          .sort(
            (a, b) => roleRank[a.role] - roleRank[b.role] || a.user.name.localeCompare(b.user.name),
          );
        return this.page(members, cursor);
      },
      add: async (tenantId, { preferredUsername, role }) => {
        const tenant = this.tenant(tenantId);
        this.needTenantAdmin(tenant);
        const name = preferredUsername.trim().toLowerCase();
        const person = name
          ? PEOPLE.find((p) => p.preferredUsername.toLowerCase() === name)
          : undefined;
        if (!person) throw userNotFound();
        if (tenant.members.has(person.id)) {
          throw error(409, "already_a_member", "This person is already a member.");
        }
        tenant.members.set(person.id, { role, addedAt: new Date().toISOString() });
        this.record({
          action: "tenant.role.set",
          target: this.ref(person.id),
          tenantId,
          workspaceId: null,
          oldRole: null,
          newRole: role,
        });
        return this.memberView(tenant, person.id);
      },
      setRole: async (tenantId, userId, role) => {
        const tenant = this.tenant(tenantId);
        this.needTenantAdmin(tenant);
        const current = tenant.members.get(userId);
        if (!current)
          throw error(404, "user_not_found", "This person is not a member of the tenant.");
        if (current.role !== role) {
          if (role !== "admin") this.checkLastAdmin(tenant, userId);
          tenant.members.set(userId, { ...current, role });
          this.record({
            action: "tenant.role.set",
            target: this.ref(userId),
            tenantId,
            workspaceId: null,
            oldRole: current.role,
            newRole: role,
          });
        }
        return this.memberView(tenant, userId);
      },
      remove: async (tenantId, userId) => {
        const tenant = this.tenant(tenantId);
        this.needTenantAdmin(tenant);
        const current = tenant.members.get(userId);
        if (!current)
          throw error(404, "user_not_found", "This person is not a member of the tenant.");
        this.checkLastAdmin(tenant, userId);
        tenant.members.delete(userId);
        this.record({
          action: "tenant.member.remove",
          target: this.ref(userId),
          tenantId,
          workspaceId: null,
          oldRole: current.role,
          newRole: null,
        });
        // The person leaves the tenant's workspaces too, one entry each. A workspace may be left without an owner.
        for (const workspaceId of await this.workspaceIdsOf(tenantId)) {
          const members = this.workspaces.get(workspaceId)?.members;
          const held = members?.get(userId);
          if (members && held) {
            members.delete(userId);
            this.record({
              action: "workspace.member.remove",
              target: this.ref(userId),
              tenantId,
              workspaceId,
              oldRole: held.role,
              newRole: null,
            });
          }
        }
      },
    },

    tenantWorkspaces: {
      list: async (tenantId, { cursor } = {}) => {
        this.needTenantAdmin(this.tenant(tenantId));
        const known = new Map((await this.source.list()).map((w) => [w.id, w]));
        const items: TenantWorkspace[] = [];
        for (const id of await this.workspaceIdsOf(tenantId)) {
          const workspace = known.get(id);
          const record = await this.workspace(id);
          const owners = [...record.members]
            .filter(([, m]) => m.role === "owner")
            .map(([userId]) => this.ref(userId));
          items.push({
            id,
            name: workspace?.name ?? id,
            owners,
            memberCount: record.members.size,
            noOwner: owners.length === 0,
            lastActivity: workspace?.updatedAt ?? new Date().toISOString(),
            createdAt: workspace?.createdAt ?? new Date().toISOString(),
          });
        }
        items.sort(
          (a, b) => b.lastActivity.localeCompare(a.lastActivity) || a.id.localeCompare(b.id),
        );
        return this.page(items, cursor);
      },
    },

    workspaceMembers: {
      list: async (workspaceId) => {
        const { members } = await this.workspace(workspaceId);
        return [...members]
          .map(([id, m]): WorkspaceMember => ({
            user: this.person(id)!,
            role: m.role,
            addedAt: m.addedAt,
          }))
          .sort(
            (a, b) => roleRank[a.role] - roleRank[b.role] || a.user.name.localeCompare(b.user.name),
          );
      },
      setRole: async (workspaceId, userId, role) => {
        const { members } = await this.workspace(workspaceId);
        const tenant = this.tenant(this.tenantIdOf(workspaceId));
        if (!this.person(userId) || !tenant.members.has(userId)) {
          throw error(422, "not_a_tenant_member", "This person is not in the workspace's tenant.");
        }
        const current = members.get(userId);
        if (current && current.role !== role) {
          if (current.role === "owner") this.checkLastOwner(members, userId);
        }
        if (!current || current.role !== role) {
          const addedAt = current?.addedAt ?? new Date().toISOString();
          members.set(userId, { role, addedAt });
          this.record({
            action: "workspace.role.set",
            target: this.ref(userId),
            tenantId: tenant.id,
            workspaceId,
            oldRole: current?.role ?? null,
            newRole: role,
          });
        }
        const held = members.get(userId)!;
        return { user: this.person(userId)!, role: held.role, addedAt: held.addedAt };
      },
      remove: async (workspaceId, userId) => {
        const { members } = await this.workspace(workspaceId);
        const current = members.get(userId);
        if (!current)
          throw error(404, "user_not_found", "This person is not a member of the workspace.");
        if (current.role === "owner") this.checkLastOwner(members, userId);
        members.delete(userId);
        this.record({
          action: "workspace.member.remove",
          target: this.ref(userId),
          tenantId: this.tenantIdOf(workspaceId),
          workspaceId,
          oldRole: current.role,
          newRole: null,
        });
      },
    },

    people: {
      find: async (preferredUsername) => {
        if (
          !this.platformAdminActing &&
          ![...this.tenants.values()].some((t) => t.members.get(ME.id)?.role === "admin")
        ) {
          throw this.forbidden();
        }
        const name = preferredUsername.trim().toLowerCase();
        if (!name) return null;
        const found = PEOPLE.filter((p) => p.preferredUsername.toLowerCase() === name);
        return found.length === 1 ? { ...found[0] } : null;
      },
      search: async ({ search, cursor } = {}) => {
        if (!this.platformAdminActing) {
          throw error(403, "forbidden", "Only a platform admin can list everyone.");
        }
        const needle = search?.trim().toLowerCase();
        const matches = PEOPLE.filter(
          (p) =>
            !needle ||
            p.name.toLowerCase().includes(needle) ||
            p.preferredUsername.toLowerCase().includes(needle),
        )
          .map((p) => ({ ...p }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return this.page(matches, cursor);
      },
    },

    platformAdmins: {
      list: async () => {
        this.needPlatformAdmin();
        return [...this.platformAdmins]
          .map((id): PlatformAdmin => ({ user: this.ref(id), source: "row" }))
          .sort((a, b) => a.user.name.localeCompare(b.user.name));
      },
      grant: async (userId) => {
        this.needPlatformAdmin();
        if (!this.person(userId)) throw userNotFound();
        if (!this.platformAdmins.has(userId)) {
          this.platformAdmins.add(userId);
          this.record({
            action: "platform_admin.grant",
            target: this.ref(userId),
            tenantId: null,
            workspaceId: null,
            oldRole: null,
            newRole: null,
          });
        }
        return { user: this.ref(userId), source: "row" };
      },
      revoke: async (userId) => {
        this.needPlatformAdmin();
        if (!this.platformAdmins.has(userId)) throw userNotFound();
        if (this.platformAdmins.size === 1) {
          throw error(
            409,
            "last_platform_admin",
            "The application needs at least one platform admin.",
          );
        }
        this.platformAdmins.delete(userId);
        this.record({
          action: "platform_admin.revoke",
          target: this.ref(userId),
          tenantId: null,
          workspaceId: null,
          oldRole: null,
          newRole: null,
        });
      },
    },

    activity: {
      list: async ({ tenantId, cursor } = {}) => {
        if (tenantId === undefined) this.needPlatformAdmin();
        else this.needTenantAdmin(this.tenant(tenantId));
        const entries = this.activityLog
          .filter((e) => tenantId === undefined || e.tenantId === tenantId)
          .map((e) => ({ ...e }));
        return this.page(entries, cursor);
      },
    },
  };

  private checkNameFree(name: string, exceptId?: string): void {
    const lower = name.toLowerCase();
    for (const t of this.tenants.values()) {
      if (t.id !== exceptId && t.name.toLowerCase() === lower) {
        throw error(409, "tenant_name_taken", "Another tenant already has this name.");
      }
    }
  }

  /** A workspace keeps one owner: the last cannot step down or leave, by anyone. */
  private checkLastOwner(members: WorkspaceRecord["members"], userId: number): void {
    const owners = [...members].filter(([, m]) => m.role === "owner").map(([id]) => id);
    if (owners.length === 1 && owners[0] === userId) {
      throw error(409, "last_owner", "A workspace needs at least one owner.");
    }
  }
}
