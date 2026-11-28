import { expect, test } from "@playwright/test";
import { createApiClient, createMemoryTokenProvider, isApiError } from "../src/lib/api";
import type { AccessApi } from "../src/services/access";
import { createHttpAccessApi } from "../src/services/http/access";
import { parsePerson } from "../src/services/http/parsers";
import { API_BASE_URL } from "./support/env";
import { newPerson, platformAdmin, type Person } from "./support/people";

/**
 * The access routes against the real backend, with no page: each read route is fetched as the
 * platform admin and as a new person, and the answer goes through the same parsers the app uses.
 * A parser that refuses an answer (a new word, a missing field) fails here, not in a screen.
 * Nothing is changed for the shared platform admin; the new person makes one workspace and
 * deletes it again.
 */

const clientFor = (person: Person) =>
  createApiClient({
    baseUrl: API_BASE_URL,
    tokens: createMemoryTokenProvider({ initialToken: person.token }),
  });

const accessFor = (person: Person): AccessApi => createHttpAccessApi(clientFor(person));

const refusedWith = async (call: Promise<unknown>, status: number, code: string) => {
  const error = await call.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(isApiError(error), "an ApiError").toBe(true);
  if (isApiError(error)) expect([error.status, error.code]).toEqual([status, code]);
};

test.describe("the access routes answer what the parsers read", () => {
  test("as the platform admin and as a new person", async () => {
    const admin = platformAdmin();
    const person = newPerson();
    const adminAccess = accessFor(admin);
    const personAccess = accessFor(person);
    const personClient = clientFor(person);

    // The new person signs in with their first call, and makes a workspace of their own.
    const me = parsePerson(await personClient.get("me"));
    const created = (await personClient.post("workspaces", {
      body: { name: `Access ${me.id}` },
    })) as {
      id: string;
    };

    try {
      // The platform admin sees everything the routes list.
      const tenants = await adminAccess.tenants.list();
      const fallback = tenants.find((t) => t.name === "Default");
      expect(fallback, "the tenant Default").toBeDefined();
      expect(typeof fallback?.memberCount).toBe("number");
      expect(typeof fallback?.workspaceCount).toBe("number");
      const tenantId = fallback!.id;

      const members = await adminAccess.tenantMembers.list(tenantId, {
        search: me.preferredUsername,
      });
      const mine = members.items.find((m) => m.user.id === me.id);
      expect(mine?.role).toBe("member");

      const workspaces = await adminAccess.tenantWorkspaces.list(tenantId);
      expect(Array.isArray(workspaces.items)).toBe(true);

      const found = await adminAccess.people.find(me.preferredUsername);
      // Dev tokens may share a sign-in name, and then the API answers no one: only a match is checked.
      if (found) expect(found.id).toBe(me.id);
      expect(await adminAccess.people.find("nobody.has.this.name@example.invalid")).toBeNull();
      const everyone = await adminAccess.people.search({ search: me.preferredUsername });
      expect(everyone.items.map((p) => p.id)).toContain(me.id);

      const admins = await adminAccess.platformAdmins.list();
      expect(admins.length).toBeGreaterThan(0);
      expect(admins.every((a) => a.source === "row" || a.source === "setting")).toBe(true);

      const everything = await adminAccess.activity.list();
      expect(Array.isArray(everything.items)).toBe(true);
      const ofTenant = await adminAccess.activity.list({ tenantId });
      expect(ofTenant.items.every((e) => e.tenantId === tenantId)).toBe(true);
      // The new person joined Default on their first sign-in: that is an entry.
      const joined = await adminAccess.activity.list({ tenantId });
      expect(joined.items.length).toBeGreaterThan(0);

      // The admin manages the workspace's members without reading its content.
      const wsMembers = await adminAccess.workspaceMembers.list(created.id);
      expect(wsMembers.map((m) => [m.user.id, m.role])).toEqual([[me.id, "owner"]]);

      // A new person sees their own tenant, without counts, and the members of it.
      const own = await personAccess.tenants.list();
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({
        name: "Default",
        role: "member",
        memberCount: null,
        workspaceCount: null,
      });
      const ownMembers = await personAccess.tenantMembers.list(own[0].id, {
        search: me.preferredUsername,
      });
      expect(ownMembers.items.map((m) => m.user.id)).toContain(me.id);
      const ownWorkspace = await personAccess.workspaceMembers.list(created.id);
      expect(ownWorkspace).toHaveLength(1);

      // And is refused what is not theirs, with the codes the screens have words for.
      await refusedWith(personAccess.tenantWorkspaces.list(own[0].id), 403, "forbidden");
      await refusedWith(personAccess.people.search(), 403, "forbidden");
      await refusedWith(personAccess.platformAdmins.list(), 403, "forbidden");
      await refusedWith(personAccess.activity.list(), 403, "forbidden");
      await refusedWith(personAccess.tenants.create("Not allowed"), 403, "forbidden");
    } finally {
      await personClient.delete(`workspaces/${created.id}`);
    }
  });
});
