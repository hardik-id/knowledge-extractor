import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TenantMember } from "@/services/access";
import { ROLE_LABEL, visibleMembers } from "./member-rules";

const member = (id: number, role: TenantMember["role"] = "member"): TenantMember => ({
  user: { id, name: `Person ${id}`, preferredUsername: `p${id}@example.com` },
  role,
  addedAt: "2026-11-01T09:00:00Z",
});

describe("visibleMembers", () => {
  test("joins the pages and keeps their order", () => {
    const rows = visibleMembers([[member(1), member(2)], [member(3)]], {}, new Set());
    assert.deepEqual(
      rows.map((m) => m.user.id),
      [1, 2, 3],
    );
  });

  test("shows a person once when two pages both have them", () => {
    const rows = visibleMembers(
      [
        [member(1), member(2)],
        [member(2), member(3)],
      ],
      {},
      new Set(),
    );
    assert.deepEqual(
      rows.map((m) => m.user.id),
      [1, 2, 3],
    );
  });

  test("applies a changed role and drops a removed person", () => {
    const rows = visibleMembers(
      [[member(1), member(2), member(3)]],
      { 2: member(2, "admin") },
      new Set([3]),
    );
    assert.deepEqual(
      rows.map((m) => [m.user.id, m.role]),
      [
        [1, "member"],
        [2, "admin"],
      ],
    );
  });
});

describe("ROLE_LABEL", () => {
  test("words for both roles", () => {
    assert.deepEqual(ROLE_LABEL, { admin: "Admin", member: "Member" });
  });
});
