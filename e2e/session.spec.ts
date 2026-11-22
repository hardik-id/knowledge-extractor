import type { Page } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, test, type Person } from "./fixtures";
import { editPrompt, promptLine, saveConfiguration } from "./pages/extraction";
import { DOCS, extractPath, openExtraction } from "./pages/studio";

/**
 * A refused token (401) ends the session once, for the whole app, and the person pastes a new
 * token in one place (mode none, the mode this suite runs in). The fixtures put `person.token`
 * on every API request, so a refused token is the same token with one character changed, and
 * a good one is the original put back. What is pasted into the dialog is only what the app
 * sends: the fixtures' header replaces it, so the API's answer follows `person.token`.
 */

function broken(token: string): string {
  // A character inside the signature, not the last one: that one can carry padding bits only.
  const at = token.length - 10;
  return token.slice(0, at) + (token[at] === "A" ? "B" : "A") + token.slice(at + 1);
}

/** Makes the API refuse this person's token, or accept it again. */
function refuse(person: Person) {
  const good = person.token;
  person.token = broken(good);
  return () => {
    person.token = good;
  };
}

const dialog = (page: Page) =>
  page.getByRole("dialog", { name: "The access token is no longer accepted" });

async function paste(page: Page, text = "a-new-token-from-make-token") {
  await dialog(page).getByLabel("Access token").fill(text);
  await dialog(page).getByRole("button", { name: "Continue" }).click();
}

/** Nothing else on the page reports the ended session or a failed load. */
async function expectOnlyTheDialog(page: Page) {
  await expect(page.getByText("no longer accepted")).toHaveCount(1);
  await expect(page.getByText("Your session has ended")).toHaveCount(0);
  await expect(page.getByText(/Couldn.t (save|load|send)/)).toHaveCount(0);
  await expect(page.getByText("The server didn't answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
}

test("a refused token while working: one dialog, then the work is still there", async ({
  api,
  page,
  person,
  expectApiError,
}) => {
  expectApiError({ status: 401 });
  const project = await api.createProject({ name: "Refused while working" });
  await openExtraction(page, project, [DOCS.roadmap]);
  await editPrompt(page, "Find every renewal date");
  const message = page.getByRole("textbox", { name: "Ask the assistant" });
  await message.fill("also add a field for the owner");
  const address = page.url();

  const restore = refuse(person);
  await saveConfiguration(page);

  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("make token");
  await expectOnlyTheDialog(page);

  restore();
  await paste(page);
  await expect(dialog(page)).toBeHidden();

  expect(page.url()).toBe(address);
  await expect(promptLine(page)).toContainText("Find every renewal date");
  await expect(message).toHaveValue("also add a field for the owner");

  // The save the person was making can be done now.
  await saveConfiguration(page);
  await expect(page.getByTestId("version-line")).toContainText("Version 2");
});

test("a refused token on a reload of the project page: the dialog, then the page with its data", async ({
  api,
  page,
  person,
  expectApiError,
}) => {
  expectApiError({ status: 401 });
  const project = await api.createProject({ name: "Refused on reload" });
  await openExtraction(page, project, [DOCS.roadmap]);

  const restore = refuse(person);
  await page.reload();

  await expect(dialog(page)).toBeVisible();
  await expectOnlyTheDialog(page);
  await expect(page.getByText("This project no longer exists")).toHaveCount(0);

  restore();
  await paste(page);
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByTestId("project-top-bar").locator("visible=true")).toBeVisible();
  await expect(page.getByTestId("version-line")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(extractPath(project.id));
});

test("a refused token on the project list: the dialog, then the list", async ({
  api,
  page,
  person,
  expectApiError,
}) => {
  expectApiError({ status: 401 });
  await api.createProject({ name: "Listed after the token came back" });
  const restore = refuse(person);
  await page.goto("/studio");

  await expect(dialog(page)).toBeVisible();
  await expectOnlyTheDialog(page);

  restore();
  await paste(page);
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("link", { name: "Listed after the token came back" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/studio");
});

test("a pasted token the API refuses too says so, in the same place", async ({
  api,
  page,
  person,
  expectApiError,
}) => {
  expectApiError({ status: 401 });
  await api.createProject({ name: "Second try" });
  const restore = refuse(person);
  await page.goto("/studio");
  await expect(dialog(page)).toBeVisible();

  await paste(page, "still-not-a-good-token");
  await expect(dialog(page).getByRole("alert")).toContainText("refused this token as well");
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole("link", { name: "Second try" })).toHaveCount(0);

  restore();
  await paste(page, "a-good-one");
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole("link", { name: "Second try" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`the token dialog, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("passes the accessibility scan, with and without its error", async ({
      api,
      page,
      person,
      expectApiError,
    }) => {
      expectApiError({ status: 401 });
      await api.createProject({ name: "Scanned" });
      refuse(person);
      await page.goto("/studio");
      await expect(dialog(page)).toBeVisible();
      await expectAccessible(page, `token dialog (${scheme})`);

      await paste(page, "not-good-either");
      await expect(dialog(page).getByRole("alert")).toBeVisible();
      await expect(dialog(page).getByRole("button", { name: "Continue" })).toBeEnabled();
      // The pointer is still over the button; scan its resting colours (hover is the design system's).
      await page.mouse.move(0, 0);
      // Colours are mid-transition for a moment after the pointer leaves: scan them at rest.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a instanceof CSSTransition)
            .map((a) => a.finished),
        ),
      );
      await expectAccessible(page, `token dialog with an error (${scheme})`);
    });
  });
}
