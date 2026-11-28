import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ACCESS_TABS, tabHref, visibleTabs, type AccessTab } from "./access-tabs";

describe("the tab list", () => {
  test("starts with Members, and every tab has its own address", () => {
    assert.equal(ACCESS_TABS[0].id, "members");
    assert.equal(ACCESS_TABS[0].label, "Members");
    assert.equal(new Set(ACCESS_TABS.map((t) => t.id)).size, ACCESS_TABS.length);
  });

  test("a tab for platform admins only is hidden from anyone else", () => {
    const tabs: AccessTab[] = [
      { id: "members", label: "Members" },
      { id: "tenants", label: "Tenants", platformAdminOnly: true },
    ];
    assert.deepEqual(
      visibleTabs({ platformAdmin: false }, tabs).map((t) => t.id),
      ["members"],
    );
    assert.deepEqual(
      visibleTabs({ platformAdmin: true }, tabs).map((t) => t.id),
      ["members", "tenants"],
    );
  });
});

describe("tabHref", () => {
  test("keeps the chosen tenant in the address", () => {
    assert.equal(tabHref({ id: "members" }, "abc-1"), "/access/members?tenant=abc-1");
  });

  test("has no query without a tenant, and escapes one", () => {
    assert.equal(tabHref({ id: "members" }, null), "/access/members");
    assert.equal(tabHref({ id: "members" }, "a&b"), "/access/members?tenant=a%26b");
  });
});
