import { addDocument, extractPath, scrollsSideways, submitDocumentsButton } from "./pages/studio";
import { expect, test } from "./fixtures";
import { expectWorkingScreen } from "./pages/working-screen";

test.use({ viewport: { width: 390, height: 844 } });

test("the project list fits a phone and its actions are reachable", async ({ api, page }) => {
  await api.createProject({
    name: "A project with a rather long name that has to wrap on a phone screen",
    description: "A description that is long enough to need more than one line at this width.",
  });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "A project with a rather long name" });
  await expect(row).toBeVisible();

  expect(await scrollsSideways(page), "the project list scrolls sideways").toBe(false);
  for (const action of [
    page.getByRole("button", { name: "New project" }),
    row.getByRole("link", { name: /A project with a rather long name/ }),
    row.getByRole("button", { name: "Edit" }),
    row.getByRole("button", { name: "Delete" }),
  ]) {
    await expect(action).toBeInViewport({ ratio: 1 });
  }
});

test("a project and the extraction page fit a phone, and the assistant opens from the top bar", async ({
  api,
  expectApiError,
  page,
  person,
}) => {
  // The document of a file nobody has extracted yet: "extraction_not_found" is how the API says so.
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
  const project = await api.createProject({ name: "Phone project" });
  await addDocument(person, project.run_id);

  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByTestId("project-top-bar")).toBeVisible();
  await expect(
    page.getByTestId("project-top-bar").getByRole("link", { name: "Projects" }),
  ).toBeInViewport({ ratio: 1 });
  await expectWorkingScreen(page);
  expect(await scrollsSideways(page), "the project page scrolls sideways").toBe(false);

  // A project without documents: the picker is the whole screen.
  const empty = await api.createProject({ name: "Phone empty project" });
  await page.goto(extractPath(empty.id));
  await expect(submitDocumentsButton(page)).toBeVisible();
  expect(await scrollsSideways(page), "the picker scrolls sideways").toBe(false);

  await page.goto(extractPath(project.id));
  await expectWorkingScreen(page);
  const bar = page.getByTestId("project-top-bar");
  await expect(bar.getByRole("button", { name: "Phone project" })).toBeInViewport({ ratio: 1 });
  expect(await scrollsSideways(page), "the top bar scrolls sideways").toBe(false);
  const run = page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ });
  await run.scrollIntoViewIfNeeded();
  await expect(run).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("version-line")).toBeVisible();
  for (const name of ["Output", "Document"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await scrollsSideways(page), `the ${name} view scrolls sideways`).toBe(false);
  }

  // The field column is an overlay on a phone: "Fields" opens it, "Assistant" opens it too and
  // puts the cursor in the assistant's input.
  await page.getByRole("button", { name: "Fields" }).click();
  const fields = page.getByRole("dialog", { name: "Fields" });
  await expect(fields).toBeVisible();
  const input = fields.getByRole("textbox", { name: "Ask the assistant" });
  await expect(input).toBeVisible();
  expect(await scrollsSideways(page), "the open overlay scrolls sideways").toBe(false);
  await page.keyboard.press("Escape");
  await expect(fields).toBeHidden();

  await bar.getByRole("button", { name: "Assistant" }).click();
  await expect(fields).toBeVisible();
  await expect(input).toBeFocused();
  await expect(fields.getByRole("log", { name: "Conversation" })).toBeVisible();
  expect(await scrollsSideways(page), "the open assistant scrolls sideways").toBe(false);
});
