import {
  addDocument,
  extractPath,
  scrollsSideways,
  tab,
  submitDocumentsButton,
} from "./pages/studio";
import { expect, test } from "./fixtures";

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

test("a project and the extraction page fit a phone, and the assistant opens and closes", async ({
  api,
  expectApiError,
  page,
  person,
}) => {
  // The Review tab of a file nobody has extracted yet: "extraction_not_found" is how the API says so.
  expectApiError({ status: 404, method: "GET", path: /\/files\/[^/]+\/extraction$/ });
  const project = await api.createProject({ name: "Phone project" });
  await addDocument(person, project.run_id);

  await page.goto(`/studio/projects/${project.id}`);
  await expect(page.getByTestId("project-top-bar")).toBeVisible();
  await expect(
    page.getByTestId("project-top-bar").getByRole("link", { name: "Projects" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(tab(page, "Define")).toBeVisible();
  expect(await scrollsSideways(page), "the project page scrolls sideways").toBe(false);

  // A project without documents: the picker is the whole screen.
  const empty = await api.createProject({ name: "Phone empty project" });
  await page.goto(extractPath(empty.id));
  await expect(submitDocumentsButton(page)).toBeVisible();
  expect(await scrollsSideways(page), "the picker scrolls sideways").toBe(false);

  await page.goto(extractPath(project.id));
  await expect(tab(page, "Define")).toBeVisible();
  const bar = page.getByTestId("project-top-bar");
  await expect(bar.getByRole("button", { name: "Phone project" })).toBeInViewport({ ratio: 1 });
  expect(await scrollsSideways(page), "the top bar scrolls sideways").toBe(false);
  const run = page.getByTestId("project-top-bar").getByRole("button", { name: /^Run/ });
  await run.scrollIntoViewIfNeeded();
  await expect(run).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("version-line")).toBeVisible();
  for (const name of ["Define", "Review", "Output"] as const) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
    expect(await scrollsSideways(page), `the ${name} tab scrolls sideways`).toBe(false);
  }

  // The assistant panel: open at first, "Hide" closes it, "Show" opens it again.
  await tab(page, "Define").click();
  const input = page.getByLabel("Message to the assistant");
  await expect(input).toBeVisible();
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(input).toBeHidden();
  await expect(page.getByRole("button", { name: "Show" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(await scrollsSideways(page), "the closed assistant scrolls sideways").toBe(false);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(input).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
  expect(await scrollsSideways(page), "the open assistant scrolls sideways").toBe(false);
});
