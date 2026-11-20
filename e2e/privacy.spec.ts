import { addDocument, apiAs, extractPath } from "./pages/studio";
import { expect, test } from "./fixtures";
import { newPerson } from "./support/people";

test("person B does not see person A's project in the list", async ({ api, contextFor, page }) => {
  await api.createProject({ name: "A's private project" });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "A's private project" })).toBeVisible();

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  await otherPage.goto("/studio");
  await expect(otherPage.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  await expect(otherPage.getByText("A's private project")).toHaveCount(0);
});

test("person B opening A's project address sees 'not found', not A's data", async ({
  api,
  contextFor,
  expectApiError,
  person,
}) => {
  const project = await api.createProject({
    name: "A's secret project",
    description: "Only A may read this",
  });
  await addDocument(person, project.run_id);
  // B's browser asks for A's project and then A's run: both are refused.
  expectApiError({ status: 404, path: /^\/(projects|runs)\// });

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  for (const path of [`/studio/projects/${project.id}`, extractPath(project.id)]) {
    await otherPage.goto(path);
    await expect(otherPage.getByText("This project no longer exists")).toBeVisible();
    await expect(otherPage.getByText("A's secret project")).toHaveCount(0);
    await expect(otherPage.getByText("Only A may read this")).toHaveCount(0);
    await expect(otherPage.getByText("architecture-decisions-2026.md")).toHaveCount(0);
  }
});

test("person B cannot reach A's run through the API", async ({ api, person }) => {
  const project = await api.createProject({ name: "A's API project" });
  await addDocument(person, project.run_id);
  const runId = project.run_id;

  const asA = await apiAs(person);
  const asB = await apiAs(newPerson());
  try {
    // The owner can read all of it, so the 404s below are about the person and not the address.
    expect((await asA.get(`runs/${runId}`)).status()).toBe(200);
    expect((await asA.get(`projects/${project.id}`)).status()).toBe(200);

    const reads = [
      `runs/${runId}`,
      `runs/${runId}/stages/extract/definition`,
      `projects/${project.id}`,
    ];
    for (const path of reads) {
      expect((await asB.get(path)).status(), `B reading ${path}`).toBe(404);
    }
    const writes = await Promise.all([
      asB.put(`runs/${runId}/documents`, { data: { items: [] } }),
      asB.post(`runs/${runId}/stages/extract/executions`, { data: { file_ids: [] } }),
      asB.delete(`projects/${project.id}`),
    ]);
    for (const response of writes) {
      expect(response.status(), `B changing A's run (${response.url()})`).toBe(404);
    }

    // B's refused delete changed nothing.
    expect((await asA.get(`projects/${project.id}`)).status()).toBe(200);
  } finally {
    await asA.dispose();
    await asB.dispose();
  }
});

test("a request without a token gets a sign-in problem, not data", async ({ api, person }) => {
  const project = await api.createProject({ name: "Needs a token" });
  await addDocument(person, project.run_id);

  const nobody = await apiAs(null);
  try {
    for (const path of ["projects", `projects/${project.id}`, `runs/${project.run_id}`]) {
      const response = await nobody.get(path);
      expect(response.status(), `GET ${path} without a token`).toBe(401);
      const body = await response.text();
      expect(body).not.toContain("Needs a token");
      expect(body).not.toContain("architecture-decisions-2026.md");
    }
  } finally {
    await nobody.dispose();
  }
});
