import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import type { AccessApi } from "../access";
import {
  parseActivityEntry,
  parsePage,
  parsePlatformAdmin,
  parseTenant,
  parseTenantMember,
  parseTenantWorkspace,
  parseWorkspaceMember,
} from "../http/access-parsers";
import { createMockServices } from "./index";
import { MockAccess } from "./mock-access";
import { MockBackend } from "./mock-backend";

const rejectsWith = (promise: Promise<unknown>, code: string, status: number) =>
  assert.rejects(promise, (error) => {
    assert.ok(isApiError(error), "rejects with an ApiError");
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });

const DEFAULT = "tenant_default";

/** An access mock over a mock backend with one workspace. */
async function withWorkspace(options: { platformAdmin?: boolean } = {}) {
  const backend = new MockBackend({ speed: 0, storage: null, persistentStorage: null });
  const workspace = await backend.createWorkspace({ name: "ADRs" });
  const mock = new MockAccess({
    ...options,
    workspaces: { list: () => backend.listWorkspaces(), get: (id) => backend.getWorkspace(id) },
  });
  return { mock, api: mock.api, workspace };
}

const plain = () => new MockAccess().api;

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** The wire form of a mock answer: snake_case keys, as the API sends it. */
const toWire = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(toWire)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [snake(k), toWire(v)]))
      : value;

describe("mock access: what is there at the start", () => {
  test("Default, with the mock person as its admin, and the five people", async () => {
    const api = plain();
    const tenants = await api.tenants.list();
    assert.deepEqual(tenants, [
      { id: DEFAULT, name: "Default", role: "admin", memberCount: 4, workspaceCount: 0 },
    ]);
    const members = await api.tenantMembers.list(DEFAULT);
    assert.equal(members.items.length, 4);
    assert.ok(members.items.some((m) => m.user.name === "Mock person" && m.role === "admin"));
    assert.equal((await api.people.search()).items.length, 6);
    assert.deepEqual(
      (await api.platformAdmins.list()).map((a) => [a.user.name, a.source]),
      [["Mock person", "row"]],
    );
    assert.deepEqual((await api.activity.list()).items, []);
  });

  test("a workspace of the mock backend has the mock person as its owner", async () => {
    const { api, workspace } = await withWorkspace();
    const members = await api.workspaceMembers.list(workspace.id);
    assert.deepEqual(
      members.map((m) => [m.user.name, m.role]),
      [
        ["Mock person", "owner"],
        ["Priya Nair", "editor"],
        ["Tom Becker", "viewer"],
      ],
    );
    const page = await api.tenantWorkspaces.list(DEFAULT);
    assert.equal(page.items[0].name, "ADRs");
    assert.deepEqual(
      page.items[0].owners.map((o) => o.name),
      ["Mock person"],
    );
    assert.equal(page.items[0].noOwner, false);
  });

  test("a workspace that does not exist is a 404", async () => {
    const { api } = await withWorkspace();
    await rejectsWith(api.workspaceMembers.list("nope"), "workspace_not_found", 404);
  });

  test("createMockServices serves them", async () => {
    const services = createMockServices(
      new MockBackend({ speed: 0, storage: null, persistentStorage: null }),
    );
    assert.equal((await services.access.tenants.list())[0].name, "Default");
  });
});

describe("mock access: tenants", () => {
  test("create, rename and remove, with an entry for each", async () => {
    const api = plain();
    const made = await api.tenants.create("  Legal ");
    assert.equal(made.name, "Legal");
    assert.deepEqual([made.role, made.memberCount, made.workspaceCount], [null, 0, 0]);
    const renamed = await api.tenants.rename(made.id, "Law");
    assert.equal(renamed.name, "Law");
    await api.tenants.remove(made.id);
    assert.deepEqual(
      (await api.tenants.list()).map((t) => t.name),
      ["Default"],
    );
    assert.deepEqual(
      (await api.activity.list()).items.map((e) => e.action),
      ["tenant.delete", "tenant.rename", "tenant.create"],
    );
  });

  test("a name taken (ignoring case) is 409, a tenant may change the case of its own name", async () => {
    const api = plain();
    await rejectsWith(api.tenants.create("default"), "tenant_name_taken", 409);
    const made = await api.tenants.create("Legal");
    await rejectsWith(api.tenants.rename(made.id, "DEFAULT"), "tenant_name_taken", 409);
    assert.equal((await api.tenants.rename(made.id, "LEGAL")).name, "LEGAL");
  });

  test("a blank or too long name is 422, an unknown tenant 404", async () => {
    const api = plain();
    await rejectsWith(api.tenants.create("  "), "validation_error", 422);
    await rejectsWith(api.tenants.create("x".repeat(121)), "validation_error", 422);
    await rejectsWith(api.tenants.rename("nope", "A"), "tenant_not_found", 404);
    await rejectsWith(api.tenants.remove("nope"), "tenant_not_found", 404);
    await rejectsWith(api.tenantMembers.list("nope"), "tenant_not_found", 404);
  });

  test("Default cannot be deleted; a tenant with workspaces cannot either", async () => {
    const { mock, api, workspace } = await withWorkspace();
    await rejectsWith(api.tenants.remove(DEFAULT), "default_tenant", 409);
    const legal = await api.tenants.create("Legal");
    mock.assignWorkspace(workspace.id, legal.id);
    assert.equal((await api.tenants.list()).find((t) => t.id === legal.id)?.workspaceCount, 1);
    await rejectsWith(api.tenants.remove(legal.id), "tenant_not_empty", 409);
  });

  test("deleting a tenant records the removal of each member first", async () => {
    const api = plain();
    const t = await api.tenants.create("Legal");
    await api.tenantMembers.add(t.id, {
      preferredUsername: "samir.haddad@example.com",
      role: "member",
    });
    await api.tenants.remove(t.id);
    assert.deepEqual(
      (await api.activity.list()).items.filter((e) => e.tenantId === t.id).map((e) => e.action),
      ["tenant.delete", "tenant.member.remove", "tenant.role.set", "tenant.create"],
    );
  });

  test("someone who is not a platform admin sees only their tenants, with no counts", async () => {
    const api = new MockAccess({ platformAdmin: false }).api;
    const [tenant] = await api.tenants.list();
    assert.deepEqual([tenant.memberCount, tenant.workspaceCount], [null, null]);
  });
});

describe("mock access: a tenant's members", () => {
  test("add by the exact sign-in name (any case), then change the role, then remove", async () => {
    const api = plain();
    const added = await api.tenantMembers.add(DEFAULT, {
      preferredUsername: " Samir.Haddad@Example.com ",
      role: "member",
    });
    assert.equal(added.user.name, "Samir Haddad");
    const changed = await api.tenantMembers.setRole(DEFAULT, added.user.id, "admin");
    assert.equal(changed.role, "admin");
    await api.tenantMembers.remove(DEFAULT, added.user.id);
    assert.equal((await api.tenantMembers.list(DEFAULT)).items.length, 4);
    assert.deepEqual(
      (await api.activity.list()).items.map((e) => [e.action, e.oldRole, e.newRole]),
      [
        ["tenant.member.remove", "admin", null],
        ["tenant.role.set", "member", "admin"],
        ["tenant.role.set", null, "member"],
      ],
    );
  });

  test("an unknown sign-in name is user_not_found, a part of one too; a member already is 409", async () => {
    const api = plain();
    await rejectsWith(
      api.tenantMembers.add(DEFAULT, { preferredUsername: "nobody@example.com", role: "member" }),
      "user_not_found",
      404,
    );
    await rejectsWith(
      api.tenantMembers.add(DEFAULT, { preferredUsername: "samir", role: "member" }),
      "user_not_found",
      404,
    );
    await rejectsWith(
      api.tenantMembers.add(DEFAULT, {
        preferredUsername: "tom.becker@example.com",
        role: "member",
      }),
      "already_a_member",
      409,
    );
  });

  test("setting or removing someone who is not a member is user_not_found", async () => {
    const api = plain();
    await rejectsWith(api.tenantMembers.setRole(DEFAULT, 5, "admin"), "user_not_found", 404);
    await rejectsWith(api.tenantMembers.remove(DEFAULT, 5), "user_not_found", 404);
  });

  test("the last admin cannot step down or leave, unless a platform admin acts", async () => {
    const api = new MockAccess({ platformAdmin: false }).api;
    await api.tenantMembers.setRole(DEFAULT, 2, "member"); // Priya steps down: the mock person stays
    await rejectsWith(api.tenantMembers.setRole(DEFAULT, 1, "member"), "last_tenant_admin", 409);
    await rejectsWith(api.tenantMembers.remove(DEFAULT, 1), "last_tenant_admin", 409);

    const admin = plain();
    await admin.tenantMembers.setRole(DEFAULT, 2, "member");
    assert.equal((await admin.tenantMembers.setRole(DEFAULT, 1, "member")).role, "member");
  });

  test("the same role changes nothing and records nothing", async () => {
    const api = plain();
    await api.tenantMembers.setRole(DEFAULT, 3, "member");
    assert.deepEqual((await api.activity.list()).items, []);
  });

  test("search on name or sign-in name, and pages", async () => {
    const api = new MockAccess({ pageSize: 3 }).api;
    assert.deepEqual(
      (await api.tenantMembers.list(DEFAULT, { search: "BECKER" })).items.map((m) => m.user.name),
      ["Tom Becker"],
    );
    assert.equal(
      (await api.tenantMembers.list(DEFAULT, { search: "lena.moreau" })).items.length,
      1,
    );
    const first = await api.tenantMembers.list(DEFAULT);
    assert.equal(first.items.length, 3);
    assert.equal(first.next, "3");
    const second = await api.tenantMembers.list(DEFAULT, { cursor: first.next });
    assert.equal(second.items.length, 1);
    assert.equal(second.next, null);
    await rejectsWith(api.tenantMembers.list(DEFAULT, { cursor: "x" }), "validation_error", 422);
  });

  test("removing a member also removes them from the tenant's workspaces, one entry each", async () => {
    const { api, workspace } = await withWorkspace();
    await api.workspaceMembers.list(workspace.id);
    await api.tenantMembers.remove(DEFAULT, 3); // Tom, a viewer of the workspace
    assert.deepEqual(
      (await api.workspaceMembers.list(workspace.id)).map((m) => m.user.name),
      ["Mock person", "Priya Nair"],
    );
    assert.deepEqual(
      (await api.activity.list({ tenantId: DEFAULT })).items.map((e) => e.action),
      ["workspace.member.remove", "tenant.member.remove"],
    );
  });
});

describe("mock access: a workspace's members", () => {
  test("give a role, change it, remove", async () => {
    const { api, workspace } = await withWorkspace();
    const added = await api.workspaceMembers.setRole(workspace.id, 4, "viewer");
    assert.equal(added.user.name, "Lena Moreau");
    assert.equal((await api.workspaceMembers.setRole(workspace.id, 4, "editor")).role, "editor");
    await api.workspaceMembers.remove(workspace.id, 4);
    assert.equal((await api.workspaceMembers.list(workspace.id)).length, 3);
    assert.deepEqual(
      (await api.activity.list({ tenantId: DEFAULT })).items.map((e) => [e.action, e.workspaceId]),
      [
        ["workspace.member.remove", workspace.id],
        ["workspace.role.set", workspace.id],
        ["workspace.role.set", workspace.id],
      ],
    );
  });

  test("someone outside the tenant, or nobody at all, is not_a_tenant_member (422)", async () => {
    const { api, workspace } = await withWorkspace();
    await rejectsWith(
      api.workspaceMembers.setRole(workspace.id, 5, "viewer"),
      "not_a_tenant_member",
      422,
    );
    await rejectsWith(
      api.workspaceMembers.setRole(workspace.id, 999, "viewer"),
      "not_a_tenant_member",
      422,
    );
  });

  test("the last owner cannot step down or be removed; with a second owner they can", async () => {
    const { api, workspace } = await withWorkspace();
    await rejectsWith(api.workspaceMembers.setRole(workspace.id, 1, "editor"), "last_owner", 409);
    await rejectsWith(api.workspaceMembers.remove(workspace.id, 1), "last_owner", 409);
    await api.workspaceMembers.setRole(workspace.id, 2, "owner");
    await api.workspaceMembers.remove(workspace.id, 1);
    assert.deepEqual(
      (await api.workspaceMembers.list(workspace.id)).map((m) => m.role),
      ["owner", "viewer"],
    );
  });

  test("removing someone who is not a member is user_not_found", async () => {
    const { api, workspace } = await withWorkspace();
    await rejectsWith(api.workspaceMembers.remove(workspace.id, 4), "user_not_found", 404);
  });

  test("a workspace left without an owner shows noOwner", async () => {
    const { api, workspace } = await withWorkspace();
    await api.workspaceMembers.list(workspace.id);
    await api.tenantMembers.remove(DEFAULT, 1); // the platform admin acts, so it may
    assert.equal((await api.tenantWorkspaces.list(DEFAULT)).items[0].noOwner, true);
  });
});

describe("mock access: people and platform admins", () => {
  test("find is exact and ignores case; a part of a name finds no one", async () => {
    const api = plain();
    assert.equal((await api.people.find("YUKI.TANAKA@example.com"))?.name, "Yuki Tanaka");
    assert.equal(await api.people.find("yuki"), null);
    assert.equal(await api.people.find(""), null);
  });

  test("search needs a platform admin", async () => {
    const api = new MockAccess({ platformAdmin: false }).api;
    await rejectsWith(api.people.search(), "forbidden", 403);
    assert.deepEqual(
      (await plain().people.search({ search: "haddad" })).items.map((p) => p.name),
      ["Samir Haddad"],
    );
  });

  test("grant and revoke, and the last platform admin stays", async () => {
    const api = plain();
    await rejectsWith(api.platformAdmins.revoke(1), "last_platform_admin", 409);
    assert.equal((await api.platformAdmins.grant(5)).user.name, "Samir Haddad");
    await api.platformAdmins.revoke(1);
    assert.deepEqual(
      (await api.platformAdmins.list()).map((a) => a.user.id),
      [5],
    );
    await rejectsWith(api.platformAdmins.grant(999), "user_not_found", 404);
    await rejectsWith(api.platformAdmins.revoke(2), "user_not_found", 404);
    assert.deepEqual(
      (await api.activity.list()).items.map((e) => e.action),
      ["platform_admin.revoke", "platform_admin.grant"],
    );
  });

  test("granting an admin twice records once; no admin is by setting", async () => {
    const api = plain();
    await api.platformAdmins.grant(5);
    await api.platformAdmins.grant(5);
    assert.equal((await api.activity.list()).items.length, 1);
    assert.ok((await api.platformAdmins.list()).every((a) => a.source === "row"));
  });
});

describe("mock access: activity", () => {
  test("newest first, filtered by tenant, in pages; an unknown tenant is 404", async () => {
    const api = new MockAccess({ pageSize: 2 }).api;
    const legal = await api.tenants.create("Legal");
    await api.tenantMembers.add(legal.id, {
      preferredUsername: "yuki.tanaka@example.com",
      role: "admin",
    });
    await api.tenantMembers.add(DEFAULT, {
      preferredUsername: "samir.haddad@example.com",
      role: "member",
    });

    const first = await api.activity.list();
    assert.equal(first.items.length, 2);
    assert.equal(first.items[0].tenantId, DEFAULT);
    assert.equal(first.items[0].actor?.name, "Mock person");
    assert.equal(first.items[0].target?.name, "Samir Haddad");
    assert.ok(first.next);
    assert.equal((await api.activity.list({ cursor: first.next })).items.length, 1);
    assert.equal((await api.activity.list({ tenantId: legal.id })).items.length, 2);
    await rejectsWith(api.activity.list({ tenantId: "nope" }), "tenant_not_found", 404);
    await api.tenants.remove(legal.id);
    await rejectsWith(api.activity.list({ tenantId: legal.id }), "tenant_not_found", 404);
  });
});

describe("mock access: the answers pass the http parsers", () => {
  test("every shape, once through the wire form", async () => {
    const { api, workspace } = await withWorkspace();
    const legal = await api.tenants.create("Legal");
    await api.tenantMembers.add(DEFAULT, {
      preferredUsername: "samir.haddad@example.com",
      role: "member",
    });
    const check = async <T>(
      mockAnswer: T,
      parse: (wire: unknown) => T,
      wire: (answer: T) => unknown = toWire,
    ) => assert.deepEqual(parse(wire(mockAnswer)), mockAnswer);

    for (const tenant of await api.tenants.list()) {
      await check(tenant, parseTenant, (t) => ({
        ...(toWire(t) as object),
        is_default: false,
        created_at: "x",
      }));
    }
    for (const m of (await api.tenantMembers.list(DEFAULT)).items)
      await check(m, parseTenantMember);
    for (const w of (await api.tenantWorkspaces.list(DEFAULT)).items)
      await check(w, parseTenantWorkspace);
    for (const m of await api.workspaceMembers.list(workspace.id))
      await check(m, parseWorkspaceMember);
    for (const a of await api.platformAdmins.list()) {
      await check(a, parsePlatformAdmin, (x) => ({
        user_id: x.user.id,
        name: x.user.name,
        source: x.source,
      }));
    }
    const activity = await api.activity.list({ tenantId: legal.id });
    assert.deepEqual(parsePage(toWire(activity), "activity", parseActivityEntry), activity);
    const everyone = (await api.activity.list()).items;
    assert.ok(everyone.length > 0);
    for (const e of everyone) await check(e, parseActivityEntry);
  });
});

const _typeCheck: AccessApi = plain();
void _typeCheck;

describe("mock access: a person who is not a platform admin", () => {
  const lesser = () => new MockAccess({ platformAdmin: false }).api;

  test("tenant create, rename and delete answer 403", async () => {
    const api = lesser();
    await rejectsWith(api.tenants.create("New"), "forbidden", 403);
    await rejectsWith(api.tenants.rename(DEFAULT, "Other"), "forbidden", 403);
    await rejectsWith(api.tenants.remove(DEFAULT), "forbidden", 403);
  });

  test("platform admins answer 403", async () => {
    const api = lesser();
    await rejectsWith(api.platformAdmins.list(), "forbidden", 403);
    await rejectsWith(api.platformAdmins.grant(2), "forbidden", 403);
    await rejectsWith(api.platformAdmins.revoke(1), "forbidden", 403);
  });

  test("activity of all tenants answers 403, a tenant's own is allowed", async () => {
    const api = lesser();
    await rejectsWith(api.activity.list(), "forbidden", 403);
    assert.ok(Array.isArray((await api.activity.list({ tenantId: DEFAULT })).items));
  });

  test("a tenant the person does not administer is closed: workspaces, members, find", async () => {
    const api = lesser();
    await api.tenantMembers.setRole(DEFAULT, 1, "member"); // allowed: Priya is still admin
    await rejectsWith(api.tenantWorkspaces.list(DEFAULT), "forbidden", 403);
    await rejectsWith(
      api.tenantMembers.add(DEFAULT, {
        preferredUsername: "samir.haddad@example.com",
        role: "member",
      }),
      "forbidden",
      403,
    );
    await rejectsWith(api.tenantMembers.setRole(DEFAULT, 2, "member"), "forbidden", 403);
    await rejectsWith(api.tenantMembers.remove(DEFAULT, 3), "forbidden", 403);
    await rejectsWith(api.people.find("priya.nair@example.com"), "forbidden", 403);
  });
});

describe("mock access: consistency", () => {
  test("a new workspace is seeded only with people of its tenant", async () => {
    const backend = new MockBackend({ speed: 0, storage: null, persistentStorage: null });
    const access = new MockAccess({
      workspaces: { list: () => backend.listWorkspaces(), get: (id) => backend.getWorkspace(id) },
    }).api;
    await access.tenantMembers.remove(DEFAULT, 2);
    const w = await backend.createWorkspace({ name: "Late" });
    const ids = (await access.workspaceMembers.list(w.id)).map((m) => m.user.id);
    assert.ok(!ids.includes(2));
    assert.ok(ids.includes(1));
  });
});
