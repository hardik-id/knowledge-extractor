import { readFileSync } from "node:fs";
import { type BrowserContext, expect, test } from "@playwright/test";
import { ENTRA_ORIGIN, STATE_FILE, loginSkipReason } from "./env.mjs";

// Microsoft's sign-out page can take a moment.
test.setTimeout(120_000);

test.describe("the real Microsoft sign-in, from a saved login", () => {
  test.skip(loginSkipReason() !== null, loginSkipReason() ?? "");

  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // The file holds tokens: read it here, never log it, never put it in a test name or an attachment.
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
      origin: string;
      storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
      sessionStorage: Record<string, string>;
    };
    if (saved.origin !== ENTRA_ORIGIN) {
      throw new Error(
        `The saved sign-in was made on another address than ${ENTRA_ORIGIN}. Save it again with the same E2E_PORT or E2E_ENTRA_PORT.`,
      );
    }
    context = await browser.newContext({ storageState: saved.storageState, baseURL: ENTRA_ORIGIN });
    // MSAL's cache lives in sessionStorage, which a storage state leaves out.
    await context.addInitScript((items: Record<string, string>) => {
      for (const [key, value] of Object.entries(items)) {
        if (window.sessionStorage.getItem(key) === null) window.sessionStorage.setItem(key, value);
      }
    }, saved.sessionStorage);
    // Never keep a trace of this context: it would hold the tokens.
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("shows the name, loads the projects with the real token, and sign-out ends at the sign-in screen", async () => {
    const page = await context.newPage();
    let projectsStatus: number | null = null;
    page.on("response", (response) => {
      if (/\/api\/v1\/projects(\?|$)/.test(response.url())) projectsStatus = response.status();
    });

    await page.goto("/studio");
    // The name of the signed-in person shows: on the account menu, and again in its label.
    const account = page.locator('[data-slot="dropdown-menu-trigger"]');
    await expect(account.first()).toBeVisible({ timeout: 30_000 });
    await expect(account.first()).not.toHaveText("");
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    // The list came from the backend with the real token, not an error.
    await expect(page.getByText("Couldn't load your projects")).toHaveCount(0);
    expect(projectsStatus).toBe(200);

    await account.first().click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    // Out through Microsoft's sign-out page and back: the sign-in screen is the end.
    await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible({
      timeout: 90_000,
    });
  });
});
