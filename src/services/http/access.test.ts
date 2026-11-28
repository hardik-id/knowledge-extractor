import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHttpClient } from "@/lib/api/http-client";
import { createHttpServices } from "./index";
import { createHttpAccessApi } from "./access";

const user = { id: 7, name: "Ada", preferred_username: "ada@example.com" };
const member = { user, role: "member", added_at: "2026-11-28T10:00:00Z" };
const tenant = {
  id: "t1",
  name: "Default",
  is_default: true,
  role: "admin",
  member_count: null,
  workspace_count: null,
  created_at: "2026-11-28T10:00:00Z",
};

/** A client whose server records each request and answers with `body` (nothing, for a 204). */
function recordingClient(body: unknown, status = 200) {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const client = createHttpClient({
    baseUrl: "https://api.test/api/v1",
    fetch: async (url, init) => {
      requests.push({
        method: String(init?.method),
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });
    },
  });
  return { api: createHttpAccessApi(client), requests };
}

const only = (requests: { method: string; url: string; body: unknown }[]) => {
  assert.equal(requests.length, 1);
  return requests[0];
};

describe("access: tenants", () => {
  test("list, create, rename and remove", async () => {
    let r = recordingClient({ items: [tenant], next: null });
    assert.equal((await r.api.tenants.list()).length, 1);
    assert.deepEqual(only(r.requests), {
      method: "GET",
      url: "https://api.test/api/v1/tenants",
      body: undefined,
    });

    r = recordingClient(tenant, 201);
    await r.api.tenants.create("Legal");
    assert.deepEqual(only(r.requests), {
      method: "POST",
      url: "https://api.test/api/v1/tenants",
      body: { name: "Legal" },
    });

    r = recordingClient(tenant);
    await r.api.tenants.rename("t 1", "Law");
    assert.deepEqual(only(r.requests), {
      method: "PATCH",
      url: "https://api.test/api/v1/tenants/t%201",
      body: { name: "Law" },
    });

    r = recordingClient(null, 204);
    await r.api.tenants.remove("t1");
    assert.deepEqual(only(r.requests), {
      method: "DELETE",
      url: "https://api.test/api/v1/tenants/t1",
      body: undefined,
    });
  });
});

describe("access: tenant members", () => {
  test("list sends the search and the cursor, and leaves out what is not given", async () => {
    let r = recordingClient({ items: [member], next: "50" });
    const page = await r.api.tenantMembers.list("t1", { search: "ad", cursor: "50" });
    assert.equal(page.next, "50");
    assert.equal(
      only(r.requests).url,
      "https://api.test/api/v1/tenants/t1/members?search=ad&cursor=50",
    );

    r = recordingClient({ items: [], next: null });
    await r.api.tenantMembers.list("t1");
    assert.equal(only(r.requests).url, "https://api.test/api/v1/tenants/t1/members");
  });

  test("add sends the exact sign-in name and the role", async () => {
    const r = recordingClient(member);
    const added = await r.api.tenantMembers.add("t1", {
      preferredUsername: "ada@example.com",
      role: "admin",
    });
    assert.equal(added.user.preferredUsername, "ada@example.com");
    assert.deepEqual(only(r.requests), {
      method: "POST",
      url: "https://api.test/api/v1/tenants/t1/members",
      body: { preferred_username: "ada@example.com", role: "admin" },
    });
  });

  test("setRole and remove", async () => {
    let r = recordingClient(member);
    await r.api.tenantMembers.setRole("t1", 7, "member");
    assert.deepEqual(only(r.requests), {
      method: "PUT",
      url: "https://api.test/api/v1/tenants/t1/members/7",
      body: { role: "member" },
    });

    r = recordingClient(null, 204);
    await r.api.tenantMembers.remove("t1", 7);
    assert.deepEqual(only(r.requests), {
      method: "DELETE",
      url: "https://api.test/api/v1/tenants/t1/members/7",
      body: undefined,
    });
  });
});

describe("access: a tenant's workspaces", () => {
  test("list sends the cursor", async () => {
    const r = recordingClient({
      items: [
        {
          id: "w1",
          name: "ADRs",
          owners: [],
          member_count: 1,
          no_owner: true,
          last_activity: "2026-11-28T10:00:00Z",
          created_at: "2026-11-28T10:00:00Z",
        },
      ],
      next: null,
    });
    const page = await r.api.tenantWorkspaces.list("t1", { cursor: "c" });
    assert.equal(page.items[0].noOwner, true);
    assert.deepEqual(only(r.requests), {
      method: "GET",
      url: "https://api.test/api/v1/tenants/t1/workspaces?cursor=c",
      body: undefined,
    });
  });
});

describe("access: a workspace's members", () => {
  test("list, setRole and remove", async () => {
    let r = recordingClient({ items: [{ ...member, role: "owner" }] });
    assert.equal((await r.api.workspaceMembers.list("w1"))[0].role, "owner");
    assert.deepEqual(only(r.requests), {
      method: "GET",
      url: "https://api.test/api/v1/workspaces/w1/members",
      body: undefined,
    });

    r = recordingClient({ ...member, role: "editor" });
    await r.api.workspaceMembers.setRole("w1", 7, "editor");
    assert.deepEqual(only(r.requests), {
      method: "PUT",
      url: "https://api.test/api/v1/workspaces/w1/members/7",
      body: { role: "editor" },
    });

    r = recordingClient(null, 204);
    await r.api.workspaceMembers.remove("w1", 7);
    assert.deepEqual(only(r.requests), {
      method: "DELETE",
      url: "https://api.test/api/v1/workspaces/w1/members/7",
      body: undefined,
    });
  });
});

describe("access: people", () => {
  test("find asks for the exact sign-in name and gives the one person, or null", async () => {
    let r = recordingClient({ items: [user], next: null });
    assert.equal((await r.api.people.find("ada@example.com"))?.id, 7);
    assert.equal(
      only(r.requests).url,
      "https://api.test/api/v1/users?preferred_username=ada%40example.com",
    );

    r = recordingClient({ items: [], next: null });
    assert.equal(await r.api.people.find("nobody@example.com"), null);
  });

  test("find sends the name trimmed", async () => {
    const r = recordingClient({ items: [user], next: null });
    await r.api.people.find("  ada@example.com ");
    assert.equal(
      only(r.requests).url,
      "https://api.test/api/v1/users?preferred_username=ada%40example.com",
    );
  });

  test("find with a blank name asks nothing: the API would list everyone", async () => {
    const r = recordingClient({ items: [user], next: null });
    assert.equal(await r.api.people.find("   "), null);
    assert.equal(r.requests.length, 0);
  });

  test("search sends the search and the cursor", async () => {
    const r = recordingClient({ items: [user], next: null });
    await r.api.people.search({ search: "ad", cursor: "9" });
    assert.deepEqual(only(r.requests), {
      method: "GET",
      url: "https://api.test/api/v1/users?search=ad&cursor=9",
      body: undefined,
    });
  });
});

describe("access: platform admins", () => {
  test("list, grant and revoke", async () => {
    let r = recordingClient({
      items: [{ user_id: 7, name: "Ada", source: "setting" }],
      next: null,
    });
    assert.deepEqual(await r.api.platformAdmins.list(), [
      { user: { id: 7, name: "Ada" }, source: "setting" },
    ]);
    assert.equal(only(r.requests).url, "https://api.test/api/v1/platform-admins");

    r = recordingClient({ user_id: 7, name: "Ada", source: "row" });
    assert.equal((await r.api.platformAdmins.grant(7)).source, "row");
    assert.deepEqual(only(r.requests), {
      method: "PUT",
      url: "https://api.test/api/v1/platform-admins/7",
      body: undefined,
    });

    r = recordingClient(null, 204);
    await r.api.platformAdmins.revoke(7);
    assert.deepEqual(only(r.requests), {
      method: "DELETE",
      url: "https://api.test/api/v1/platform-admins/7",
      body: undefined,
    });
  });
});

describe("access: activity", () => {
  const entry = {
    id: "a1",
    action: "tenant.create",
    actor: { id: 1, name: "Ada" },
    target: null,
    tenant_id: "t1",
    workspace_id: null,
    old_role: "",
    new_role: "",
    created_at: "2026-11-28T10:00:00Z",
  };

  test("list sends the tenant and the cursor", async () => {
    let r = recordingClient({ items: [entry], next: null });
    assert.equal(
      (await r.api.activity.list({ tenantId: "t1", cursor: "5" })).items[0].action,
      "tenant.create",
    );
    assert.equal(only(r.requests).url, "https://api.test/api/v1/audit?tenant_id=t1&cursor=5");

    r = recordingClient({ items: [], next: null });
    await r.api.activity.list();
    assert.equal(only(r.requests).url, "https://api.test/api/v1/audit");
  });
});

describe("access: an answer the parsers refuse", () => {
  test("is an invalid_response error, not a half-read value", async () => {
    const r = recordingClient({ items: [{ ...member, role: "viewer" }], next: null });
    await assert.rejects(r.api.tenantMembers.list("t1"), { code: "invalid_response" });
  });
});

test("createHttpServices has the access services", () => {
  const { client } = {
    client: createHttpClient({
      baseUrl: "https://api.test/api/v1",
      fetch: async () => new Response("{}"),
    }),
  };
  const services = createHttpServices({ client, wsBaseUrl: "wss://api.test" });
  assert.ok(services.access.tenants && services.access.activity);
});
