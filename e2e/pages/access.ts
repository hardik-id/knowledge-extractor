import { type APIRequestContext, type Locator, type Page, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { API_BASE_URL } from "../support/env";
import { clickUntilOpen } from "../support/first-click";
import type { NamedPerson, Person } from "../support/people";

const asPerson = (person: Person) => ({ authorization: `Bearer ${person.token}` });

/** The person exists for the backend once they have signed in: ask who they are. */
export async function signIn(request: APIRequestContext, person: Person): Promise<void> {
  const me = await request.get(`${API_BASE_URL}/me`, { headers: asPerson(person) });
  expect(me.ok(), `GET /me answered ${me.status()}`).toBeTruthy();
}

/**
 * A tenant of the test's own, with a name nobody else has, made as the platform admin through the
 * API, and `admin` named its admin. `dispose` deletes it again (members and all): call it in a
 * `finally`, so a failed test leaves nothing behind. 'Default' and the platform admin are never changed.
 */
export async function makeTenantWithAdmin(
  request: APIRequestContext,
  platform: Person,
  admin: NamedPerson,
) {
  await signIn(request, admin);
  const name = `Access ${randomUUID().slice(0, 8)}`;
  const made = await request.post(`${API_BASE_URL}/tenants`, {
    headers: asPerson(platform),
    data: { name },
  });
  expect(made.ok(), `POST /tenants answered ${made.status()}: ${await made.text()}`).toBeTruthy();
  const { id } = (await made.json()) as { id: string };
  const added = await request.post(`${API_BASE_URL}/tenants/${id}/members`, {
    headers: asPerson(platform),
    data: { preferred_username: admin.preferredUsername, role: "admin" },
  });
  expect(added.ok(), `POST member answered ${added.status()}: ${await added.text()}`).toBeTruthy();
  return {
    id,
    name,
    dispose: async () => {
      await request.delete(`${API_BASE_URL}/tenants/${id}`, { headers: asPerson(platform) });
    },
  };
}

/** The Members tab of the Access app. */
export class AccessMembersPage {
  constructor(readonly page: Page) {}

  async open(tenantId?: string) {
    await this.page.goto(tenantId ? `/access/members?tenant=${tenantId}` : "/access/members");
    await expect(this.page.getByRole("heading", { name: "Access", level: 1 })).toBeVisible();
  }

  get table() {
    return this.page.getByRole("table", { name: /^Members of / });
  }

  /** The row of a person, by their name. */
  row(name: string): Locator {
    return this.table.getByRole("row", { name: new RegExp(name) });
  }

  roleOf(name: string): Locator {
    return this.page.getByLabel(`Role of ${name}`);
  }

  get search() {
    return this.page.getByRole("searchbox", { name: "Search members" });
  }

  get addDialog() {
    return this.page.getByRole("dialog", { name: "Add person" });
  }

  async openAddDialog() {
    await clickUntilOpen(
      this.page,
      this.page.getByRole("button", { name: "Add person" }),
      this.addDialog,
    );
  }

  /** Fills the add dialog and presses Add. */
  async add(preferredUsername: string) {
    await this.addDialog.getByLabel("Sign-in name").fill(preferredUsername);
    await this.addDialog.getByRole("button", { name: "Add", exact: true }).click();
  }

  /** Opens a row's menu and chooses "Remove from tenant". */
  async startRemoving(name: string) {
    const menu = this.page.getByRole("menu");
    await clickUntilOpen(
      this.page,
      this.row(name).getByRole("button", { name: `Actions for ${name}` }),
      menu.locator("xpath=.."),
    );
    await menu.getByRole("menuitem", { name: "Remove from tenant" }).click();
  }

  get removeDialog() {
    return this.page.getByRole("dialog", { name: /^Remove .* from / });
  }

  /** The app switcher in the sidebar (shown from 960px) or the header. */
  get appSwitcher() {
    return this.page.getByRole("button", { name: /^Switch app/ }).locator("visible=true");
  }

  async openAppSwitcher() {
    const menu = this.page.getByRole("menu");
    await clickUntilOpen(this.page, this.appSwitcher.first(), menu.locator("xpath=.."));
    return menu;
  }
}

export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}
