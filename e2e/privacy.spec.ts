import { addDocument, apiAs, extractPath } from "./pages/studio";
import { expect, newPerson, test } from "./fixtures";

test("person B does not see person A's workspace in the list", async ({
  api,
  contextFor,
  page,
}) => {
  await api.createWorkspace({ name: "A's private workspace" });
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "A's private workspace" })).toBeVisible();

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  await otherPage.goto("/studio");
  await expect(otherPage.getByRole("heading", { name: "No workspaces yet" })).toBeVisible();
  await expect(otherPage.getByText("A's private workspace")).toHaveCount(0);
});

test("person B opening A's workspace address sees 'not found', not A's data", async ({
  api,
  contextFor,
  expectApiError,
  person,
}) => {
  const workspace = await api.createWorkspace({
    name: "A's secret workspace",
    description: "Only A may read this",
  });
  await addDocument(person, workspace.run_id);
  // B's browser asks for A's workspace and then A's run: both are refused.
  expectApiError({ status: 404, path: /^\/(workspaces|runs)\// });

  const other = await contextFor(newPerson());
  const otherPage = await other.newPage();
  for (const path of [`/studio/workspaces/${workspace.id}`, extractPath(workspace.id)]) {
    await otherPage.goto(path);
    await expect(otherPage.getByText("This workspace no longer exists")).toBeVisible();
    await expect(otherPage.getByText("A's secret workspace")).toHaveCount(0);
    await expect(otherPage.getByText("Only A may read this")).toHaveCount(0);
    await expect(otherPage.getByText("architecture-decisions-2026.md")).toHaveCount(0);
  }
});

test("person B cannot reach A's run through the API", async ({ api, person }) => {
  const workspace = await api.createWorkspace({ name: "A's API workspace" });
  await addDocument(person, workspace.run_id);
  const runId = workspace.run_id;

  const asA = await apiAs(person);
  const asB = await apiAs(newPerson());
  try {
    // The owner can read all of it, so the 404s below are about the person and not the address.
    expect((await asA.get(`runs/${runId}`)).status()).toBe(200);
    expect((await asA.get(`workspaces/${workspace.id}`)).status()).toBe(200);

    const reads = [
      `runs/${runId}`,
      `runs/${runId}/stages/extract/definition`,
      `workspaces/${workspace.id}`,
    ];
    for (const path of reads) {
      expect((await asB.get(path)).status(), `B reading ${path}`).toBe(404);
    }
    const writes = await Promise.all([
      asB.put(`runs/${runId}/documents`, { data: { items: [] } }),
      asB.post(`runs/${runId}/stages/extract/executions`, { data: { file_ids: [] } }),
      asB.delete(`workspaces/${workspace.id}`),
    ]);
    for (const response of writes) {
      expect(response.status(), `B changing A's run (${response.url()})`).toBe(404);
    }

    // B's refused delete changed nothing.
    expect((await asA.get(`workspaces/${workspace.id}`)).status()).toBe(200);
  } finally {
    await asA.dispose();
    await asB.dispose();
  }
});

test("a request without a token gets a sign-in problem, not data", async ({ api, person }) => {
  const workspace = await api.createWorkspace({ name: "Needs a token" });
  await addDocument(person, workspace.run_id);

  const nobody = await apiAs(null);
  try {
    for (const path of ["workspaces", `workspaces/${workspace.id}`, `runs/${workspace.run_id}`]) {
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
