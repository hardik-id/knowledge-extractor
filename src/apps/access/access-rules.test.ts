import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Tenant } from "@/services/access";
import { manageableTenants, mayOpenAccess, pickTenant } from "./access-rules";

const tenant = (id: string, name: string, role: Tenant["role"]): Tenant => ({
  id,
  name,
  role,
  memberCount: null,
  workspaceCount: null,
});

describe("mayOpenAccess", () => {
  test("a platform admin may, with or without a tenant", () => {
    assert.equal(mayOpenAccess({ platformAdmin: true, tenants: [] }), true);
  });

  test("an admin of at least one tenant may", () => {
    const tenants = [
      { id: "a", name: "A", role: "member" as const },
      { id: "b", name: "B", role: "admin" as const },
    ];
    assert.equal(mayOpenAccess({ platformAdmin: false, tenants }), true);
  });

  test("a member only, not loaded yet, and nobody do not", () => {
    const member = [{ id: "a", name: "A", role: "member" as const }];
    assert.equal(mayOpenAccess({ platformAdmin: false, tenants: member }), false);
    assert.equal(mayOpenAccess({ platformAdmin: false, tenants: [] }), false);
    assert.equal(mayOpenAccess(undefined), false);
    assert.equal(mayOpenAccess(null), false);
  });
});

describe("manageableTenants", () => {
  const listed = [
    tenant("3", "zeta", "admin"),
    tenant("1", "Acme", "member"),
    tenant("2", "beta", "admin"),
    tenant("4", "Other", null),
  ];

  test("a platform admin can pick any tenant, by name", () => {
    const names = manageableTenants({ platformAdmin: true, tenants: [] }, listed).map(
      (t) => t.name,
    );
    assert.deepEqual(names, ["Acme", "beta", "Other", "zeta"]);
  });

  test("anyone else can pick the tenants they administer, by name", () => {
    const names = manageableTenants({ platformAdmin: false, tenants: [] }, listed).map(
      (t) => t.name,
    );
    assert.deepEqual(names, ["beta", "zeta"]);
  });

  test("does not change the list it is given", () => {
    const copy = [...listed];
    manageableTenants({ platformAdmin: true, tenants: [] }, listed);
    assert.deepEqual(listed, copy);
  });
});

describe("pickTenant", () => {
  const tenants = [tenant("1", "Acme", "admin"), tenant("2", "Beta", "admin")];

  test("the tenant the address names", () => {
    assert.equal(pickTenant(tenants, "2")?.name, "Beta");
  });

  test("the first one when none is named or the name is not one of them", () => {
    assert.equal(pickTenant(tenants, null)?.name, "Acme");
    assert.equal(pickTenant(tenants, undefined)?.name, "Acme");
    assert.equal(pickTenant(tenants, "9")?.name, "Acme");
  });

  test("none when there is no tenant", () => {
    assert.equal(pickTenant([], "1"), undefined);
  });
});
