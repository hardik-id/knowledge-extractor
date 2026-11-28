import { addDocument, extractPath, scrollsSideways, submitDocumentsButton } from "./pages/studio";
import { expect, test } from "./fixtures";
import { expectWorkingScreen } from "./pages/working-screen";

test.use({ viewport: { width: 390, height: 844 } });

test("the workspace list fits a phone and its actions are reachable", async ({ api, page }) => {
  await api.createWorkspace({
    name: "A workspace with a rather long name that has to wrap on a phone screen",
    description: "A description that is long enough to need more than one line at this width.",
  });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "A workspace with a rather long name" });
  await expect(row).toBeVisible();

  expect(await scrollsSideways(page), "the workspace list scrolls sideways").toBe(false);
  for (const action of [
    page.getByRole("button", { name: "New workspace" }),
    row.getByRole("link", { name: /A workspace with a rather long name/ }),
    row.getByRole("button", { name: "Edit" }),
    row.getByRole("button", { name: "Delete" }),
  ]) {
    await expect(action).toBeInViewport({ ratio: 1 });
  }
});

test("a workspace and the extraction page fit a phone, and the assistant opens from the top bar", async ({
  api,
  expectApiError,
  page,
  person,
}) => {
  // The document of a file nobody has extracted yet: "extraction_not_found" is how the API says so.
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
  const workspace = await api.createWorkspace({ name: "Phone workspace" });
  await addDocument(person, workspace.run_id);

  await page.goto(`/studio/workspaces/${workspace.id}`);
  await expect(page.getByTestId("workspace-top-bar")).toBeVisible();
  await expect(
    page.getByTestId("workspace-top-bar").getByRole("link", { name: "Workspaces" }),
  ).toBeInViewport({ ratio: 1 });
  await expectWorkingScreen(page);
  expect(await scrollsSideways(page), "the workspace page scrolls sideways").toBe(false);

  // A workspace without documents: the picker is the whole screen.
  const empty = await api.createWorkspace({ name: "Phone empty workspace" });
  await page.goto(extractPath(empty.id));
  await expect(submitDocumentsButton(page)).toBeVisible();
  expect(await scrollsSideways(page), "the picker scrolls sideways").toBe(false);

  await page.goto(extractPath(workspace.id));
  await expectWorkingScreen(page);
  const bar = page.getByTestId("workspace-top-bar");
  await expect(bar.getByRole("button", { name: "Phone workspace" })).toBeInViewport({ ratio: 1 });
  expect(await scrollsSideways(page), "the top bar scrolls sideways").toBe(false);
  const run = page.getByTestId("workspace-top-bar").getByRole("button", { name: /^Run/ });
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
