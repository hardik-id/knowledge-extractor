import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import {
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

const refused = (run: () => unknown) =>
  assert.throws(run, (error) => isApiError(error) && error.code === "invalid_response");

const user = { id: 7, name: "Ada", preferred_username: "ada@example.com" };

describe("parseTenant", () => {
  const wire = {
    id: "t1",
    name: "Default",
    is_default: true,
    role: "admin",
    member_count: 4,
    workspace_count: 2,
    created_at: "2026-11-28T10:00:00Z",
  };

  test("reads a platform admin's answer, with counts", () => {
    assert.deepEqual(parseTenant(wire), {
      id: "t1",
      name: "Default",
      role: "admin",
      memberCount: 4,
      workspaceCount: 2,
    });
  });

  test("reads a person's own tenant: no counts, and no role for a platform admin who is not a member", () => {
    assert.deepEqual(
      parseTenant({ ...wire, role: null, member_count: null, workspace_count: null }),
      {
        id: "t1",
        name: "Default",
        role: null,
        memberCount: null,
        workspaceCount: null,
      },
    );
  });

  test("refuses a role outside the fixed words and a count that is not a number", () => {
    refused(() => parseTenant({ ...wire, role: "owner" }));
    refused(() => parseTenant({ ...wire, member_count: "4" }));
    refused(() => parseTenant({ ...wire, name: undefined }));
  });

  test("parseTenants reads the items", () => {
    assert.equal(parseTenants({ items: [wire], next: null }).length, 1);
    refused(() => parseTenants({ items: {} }));
  });
});

describe("parsePage", () => {
  test("keeps the cursor, and a missing one is null", () => {
    assert.deepEqual(
      parsePage({ items: [1, 2], next: "2" }, "p", (v) => v),
      {
        items: [1, 2],
        next: "2",
      },
    );
    assert.equal(parsePage({ items: [] }, "p", (v) => v).next, null);
  });

  test("refuses a cursor that is not text", () => {
    refused(() => parsePage({ items: [], next: 3 }, "p", (v) => v));
  });
});

describe("parseTenantMember", () => {
  const wire = { user, role: "member", added_at: "2026-11-28T10:00:00Z" };

  test("reads a member", () => {
    assert.deepEqual(parseTenantMember(wire), {
      user: { id: 7, name: "Ada", preferredUsername: "ada@example.com" },
      role: "member",
      addedAt: "2026-11-28T10:00:00Z",
    });
  });

  test("refuses a workspace role, a missing person and a person without an id", () => {
    refused(() => parseTenantMember({ ...wire, role: "viewer" }));
    refused(() => parseTenantMember({ ...wire, user: null }));
    refused(() => parseTenantMember({ ...wire, user: { ...user, id: "7" } }));
  });
});

describe("parseTenantWorkspace", () => {
  const wire = {
    id: "w1",
    name: "ADRs",
    owners: [{ id: 1, name: "Ada" }],
    member_count: 3,
    no_owner: false,
    last_activity: "2026-11-28T11:00:00Z",
    created_at: "2026-11-27T10:00:00Z",
  };

  test("reads a workspace with its owners, and takes nothing else", () => {
    assert.deepEqual(parseTenantWorkspace({ ...wire, description: "secret" }), {
      id: "w1",
      name: "ADRs",
      owners: [{ id: 1, name: "Ada" }],
      memberCount: 3,
      noOwner: false,
      lastActivity: "2026-11-28T11:00:00Z",
      createdAt: "2026-11-27T10:00:00Z",
    });
  });

  test("refuses an owner without a name and a flag that is not true or false", () => {
    refused(() => parseTenantWorkspace({ ...wire, owners: [{ id: 1 }] }));
    refused(() => parseTenantWorkspace({ ...wire, no_owner: "no" }));
  });
});

describe("workspace members", () => {
  const wire = { user, role: "editor", added_at: "2026-11-28T10:00:00Z" };

  test("reads one member and the list", () => {
    assert.equal(parseWorkspaceMember(wire).role, "editor");
    assert.equal(parseWorkspaceMembers({ items: [wire, { ...wire, role: "owner" }] }).length, 2);
  });

  test("refuses a tenant role", () => {
    refused(() => parseWorkspaceMember({ ...wire, role: "admin" }));
    refused(() => parseWorkspaceMembers({ items: [{ ...wire, role: "boss" }] }));
    refused(() => parseWorkspaceMembers([]));
  });
});

describe("platform admins", () => {
  test("reads both sources", () => {
    assert.deepEqual(parsePlatformAdmin({ user_id: 1, name: "Ada", source: "row" }), {
      user: { id: 1, name: "Ada" },
      source: "row",
    });
    assert.equal(
      parsePlatformAdmin({ user_id: 1, name: "Ada", source: "setting" }).source,
      "setting",
    );
    assert.equal(
      parsePlatformAdmins({ items: [{ user_id: 1, name: "Ada", source: "row" }], next: null })
        .length,
      1,
    );
  });

  test("refuses another source", () => {
    refused(() => parsePlatformAdmin({ user_id: 1, name: "Ada", source: "env" }));
    refused(() => parsePlatformAdmin({ user_id: 1, name: "Ada" }));
    refused(() => parsePlatformAdmin({ name: "Ada", source: "row" }));
  });
});

describe("parseActivityEntry", () => {
  const wire = {
    id: "a1",
    action: "tenant.role.set",
    actor: { id: 1, name: "Ada" },
    target: { id: 2, name: "Bo" },
    tenant_id: "t1",
    workspace_id: null,
    old_role: "member",
    new_role: "admin",
    created_at: "2026-11-28T12:00:00Z",
  };

  test("reads an entry", () => {
    assert.deepEqual(parseActivityEntry(wire), {
      id: "a1",
      action: "tenant.role.set",
      actor: { id: 1, name: "Ada" },
      target: { id: 2, name: "Bo" },
      tenantId: "t1",
      workspaceId: null,
      oldRole: "member",
      newRole: "admin",
      createdAt: "2026-11-28T12:00:00Z",
    });
  });

  test("keeps an action it has not heard of, and reads an empty role and a missing person as null", () => {
    const entry = parseActivityEntry({
      ...wire,
      action: "something.new",
      actor: null,
      target: null,
      old_role: "",
      new_role: "",
    });
    assert.equal(entry.action, "something.new");
    assert.deepEqual(
      [entry.actor, entry.target, entry.oldRole, entry.newRole],
      [null, null, null, null],
    );
  });

  test("refuses an action that is not text and a person that is not an object", () => {
    refused(() => parseActivityEntry({ ...wire, action: 3 }));
    refused(() => parseActivityEntry({ ...wire, actor: "Ada" }));
    refused(() => parseActivityEntry({ ...wire, created_at: undefined }));
  });
});
