import { AccessMembersPage, makeTenantWithAdmin, scrollsSideways, signIn } from "./pages/access";
import { expect, namedPerson, platformAdmin, test } from "./fixtures";
import { expectAccessible } from "./support/accessibility";

/**
 * The Members tab of the Access app, against the real backend. The platform admin is one person
 * shared by every test, so each test makes a tenant of its own through the API (as them), names a
 * new person its admin, works there as that admin, and deletes the tenant at the end.
 */

test("a tenant admin finds Access, adds a person by sign-in name, changes their role and removes them", async ({
  contextFor,
  request,
}) => {
  const admin = namedPerson("Ada");
  const bo = namedPerson("Bo");
  const tenant = await makeTenantWithAdmin(request, platformAdmin(), admin);
  try {
    await signIn(request, bo);
    const page = await (await contextFor(admin)).newPage();
    const members = new AccessMembersPage(page);

    // The switcher offers Access, and it opens the Members tab of the one tenant they administer.
    await page.goto("/studio");
    const menu = await members.openAppSwitcher();
    await menu.getByRole("menuitem", { name: /^Access/ }).click();
    await expect(page).toHaveURL(/\/access\/members/);
    await expect(page.getByRole("heading", { name: "Access", level: 1 })).toBeVisible();
    await expect(page.getByText(`Tenant: ${tenant.name}`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(members.row(admin.name)).toContainText("(you)");
    await expect(members.roleOf(admin.name)).toHaveValue("admin");

    // Add the second person by the exact sign-in name; the role starts at Member.
    await members.openAddDialog();
    await expect(members.addDialog.getByLabel("Role")).toHaveValue("member");
    await members.add(bo.preferredUsername);
    await expect(members.addDialog).toBeHidden();
    await expect(members.row(bo.name)).toBeVisible();
    await expect(members.row(bo.name)).toContainText(bo.preferredUsername);
    await expect(members.roleOf(bo.name)).toHaveValue("member");

    // The search is the API's: the other person is not in the list.
    await members.search.fill(bo.preferredUsername);
    await expect(members.row(bo.name)).toBeVisible();
    await expect(members.row(admin.name)).toHaveCount(0);
    await members.search.fill("");
    await expect(members.row(admin.name)).toBeVisible();

    // Change their role, and see it kept after a reload.
    await members.roleOf(bo.name).selectOption("admin");
    await expect(members.roleOf(bo.name)).toHaveValue("admin");
    await expect(members.roleOf(bo.name)).toBeEnabled();
    await members.open();
    await expect(members.roleOf(bo.name)).toHaveValue("admin");

    // Remove them: the dialog says what else they lose.
    await members.startRemoving(bo.name);
    await expect(members.removeDialog).toContainText("roles in this tenant's workspaces");
    await members.removeDialog.getByRole("button", { name: "Remove from tenant" }).click();
    await expect(members.removeDialog).toBeHidden();
    await expect(members.row(bo.name)).toHaveCount(0);
    await expect(members.row(admin.name)).toBeVisible();
  } finally {
    await tenant.dispose();
  }
});

test("a sign-in name nobody has reads why", async ({ contextFor, expectApiError, request }) => {
  expectApiError({ status: 404, method: "POST", path: /\/members$/ });
  const admin = namedPerson("Ada");
  const tenant = await makeTenantWithAdmin(request, platformAdmin(), admin);
  try {
    const page = await (await contextFor(admin)).newPage();
    const members = new AccessMembersPage(page);
    await members.open();
    await members.openAddDialog();
    await members.add("nobody.has.this.name@dev.invalid");
    await expect(members.addDialog.getByRole("alert")).toContainText(
      "This person couldn't be found",
    );
    // Someone already in the tenant reads why too.
    await members.addDialog.getByLabel("Sign-in name").fill(admin.preferredUsername);
    expectApiError({ status: 409, method: "POST", path: /\/members$/ });
    await members.addDialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(members.addDialog.getByRole("alert")).toContainText(
      "This person is already a member.",
    );
  } finally {
    await tenant.dispose();
  }
});

test("the last admin cannot step down, and reads why", async ({
  contextFor,
  expectApiError,
  request,
}) => {
  expectApiError({ status: 409, method: "PUT", path: /\/members\/\d+$/ });
  const admin = namedPerson("Ada");
  const tenant = await makeTenantWithAdmin(request, platformAdmin(), admin);
  try {
    const page = await (await contextFor(admin)).newPage();
    const members = new AccessMembersPage(page);
    await members.open();
    await expect(members.roleOf(admin.name)).toHaveValue("admin");
    await members.roleOf(admin.name).selectOption("member");
    await expect(page.getByRole("alert").filter({ hasText: "A tenant needs" })).toContainText(
      "A tenant needs at least one admin.",
    );
    // The table is read again: they are still the admin.
    await expect(members.roleOf(admin.name)).toHaveValue("admin");
  } finally {
    await tenant.dispose();
  }
});

test("a person who is not an admin has no Access and is refused at /access", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  // Who they are has loaded once the page has: Access is not offered, so with one app the switcher is a plain name.
  await expect(page.getByRole("button", { name: /^Switch app/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Access/ })).toHaveCount(0);

  await page.goto("/access/members");
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Go to / })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("the Members tab and the add dialog pass an accessibility scan, and fit a phone", async ({
  contextFor,
  request,
}) => {
  const admin = namedPerson("Ada");
  const tenant = await makeTenantWithAdmin(request, platformAdmin(), admin);
  try {
    const page = await (await contextFor(admin)).newPage();
    const members = new AccessMembersPage(page);
    await members.open();
    await expect(members.row(admin.name)).toBeVisible();
    await expectAccessible(page, "access members");

    await members.openAddDialog();
    await expectAccessible(page, "access add person dialog");
    await page.keyboard.press("Escape");
    await expect(members.addDialog).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(members.row(admin.name)).toBeVisible();
    expect(await scrollsSideways(page), "sideways scroll at 390px").toBe(false);
  } finally {
    await tenant.dispose();
  }
});
