import { expect, test } from "./fixtures";
import { DOCS, editPrompt, openExtraction, saveConfiguration } from "./pages/studio";

test.beforeEach(async ({ api, page }) => {
  const project = await api.createProject({ name: "Versions project" });
  await openExtraction(page, project, [DOCS.roadmap]);
});

const versionLine = (page: import("@playwright/test").Page) => page.getByTestId("version-line");

test("Save configuration with a note makes version 2, and the history lists both", async ({
  page,
}) => {
  await expect(versionLine(page)).toContainText("Version 1");
  await editPrompt(page, "Find every renewal date");
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await saveConfiguration(page, "Focus on renewals");

  await expect(versionLine(page)).toContainText("Version 2");
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);

  await page.getByRole("button", { name: "Version history" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  const versions = history.getByRole("list", { name: "Versions" }).getByRole("listitem");
  await expect(versions).toHaveCount(2);
  await expect(versions.nth(0)).toContainText("Version 2");
  await expect(versions.nth(0)).toContainText("Focus on renewals");
  await expect(versions.nth(1)).toContainText("Version 1");
});

test("restoring version 1 makes a new version 3", async ({ page }) => {
  await editPrompt(page, "Find every renewal date");
  await saveConfiguration(page, "Focus on renewals");
  await expect(versionLine(page)).toContainText("Version 2");

  await page.getByRole("button", { name: "Version history" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await history.getByRole("button", { name: "View version 1" }).click();
  await history.getByRole("button", { name: "Restore this version" }).click();

  await expect(versionLine(page)).toContainText("Version 3");
  await expect(page.getByLabel("What to extract")).not.toHaveValue("Find every renewal date");

  await page.getByRole("button", { name: "Version history" }).click();
  const versions = page
    .getByRole("dialog", { name: "Version history" })
    .getByRole("list", { name: "Versions" })
    .getByRole("listitem");
  await expect(versions).toHaveCount(3);
  await expect(versions.nth(0)).toContainText("Version 3");
  await expect(versions.nth(0)).toContainText("Restored from version 1");
});

test("running with unsaved edits saves them as the next version", async ({ page }) => {
  await editPrompt(page, "Find every renewal date");
  await page.getByRole("button", { name: "Run extraction" }).click();

  await expect(versionLine(page)).toContainText("Version 2");
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);
});

test("a change made elsewhere is reported when saving, and nothing is lost", async ({
  contextFor,
  person,
  page,
  expectApiError,
}) => {
  expectApiError({ status: 409, method: "PUT" });
  // The same person, in a second browser, saves version 2 first.
  const second = await (await contextFor(person)).newPage();
  await second.goto(page.url());
  await expect(second.getByTestId("version-line")).toContainText("Version 1");
  await editPrompt(second, "Second browser wording");
  await saveConfiguration(second, "From the second browser");
  await expect(second.getByTestId("version-line")).toContainText("Version 2");

  await editPrompt(page, "First browser wording");
  await saveConfiguration(page, "From the first browser");

  await expect(page.getByText("The configuration changed elsewhere")).toBeVisible();
  await expect(
    page.getByText("We loaded the latest version. Make your changes again."),
  ).toBeVisible();
  // The latest version, with the other browser's wording, is what is loaded now.
  await expect(versionLine(page)).toContainText("Version 2");
  await expect(page.getByLabel("What to extract")).toHaveValue("Second browser wording");
});
