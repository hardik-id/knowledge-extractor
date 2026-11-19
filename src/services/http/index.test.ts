import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHttpClient } from "@/lib/api/http-client";
import { createHttpExtractionApi, createHttpProjectsApi, createHttpRunsApi } from "./index";

/** A client whose server records each request and answers with `body`. */
function recordingClient(body: unknown) {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const client = createHttpClient({
    baseUrl: "https://api.test/api/v1",
    fetch: async (url, init) => {
      requests.push({
        method: String(init?.method),
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify(body), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return { client, requests };
}

describe("createHttpRunsApi", () => {
  test("an extract execution sends its definition version as config.definition_version", async () => {
    const { client, requests } = recordingClient({
      execution_id: "exec_1",
      stage: "extract",
      file_ids: ["file_1"],
    });

    const execution = await createHttpRunsApi(client).executeStage("run_1", "extract", {
      fileIds: ["file_1"],
      config: { definitionVersion: 3 },
    });

    assert.deepEqual(execution, { id: "exec_1", stage: "extract", fileIds: ["file_1"] });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "https://api.test/api/v1/runs/run_1/stages/extract/executions");
    assert.deepEqual(requests[0].body, {
      file_ids: ["file_1"],
      config: { definition_version: 3 },
    });
  });
});

const wireDefinition = {
  version: 4,
  note: "n",
  created_at: "t",
  prompt: "p",
  record_types: [],
  output: { format: "json", template: "" },
};

describe("projects, documents, versions and the conversation", () => {
  test("a project is renamed with a PATCH of the changed keys and removed with a DELETE", async () => {
    const { client, requests } = recordingClient({
      id: "p1",
      name: "New",
      description: "",
      run_id: "r1",
      document_count: 0,
      configuration_version: null,
      created_at: "t",
      updated_at: "t",
    });
    const projects = createHttpProjectsApi(client);

    await projects.rename("p1", { name: "New" });
    await projects.remove("p 1");

    assert.deepEqual(
      requests.map((r) => [r.method, r.url, r.body]),
      [
        ["PATCH", "https://api.test/api/v1/projects/p1", { name: "New" }],
        ["DELETE", "https://api.test/api/v1/projects/p%201", undefined],
      ],
    );
  });

  test("a page of projects asks for the cursor it was given", async () => {
    const { client, requests } = recordingClient({ items: [], next: null });
    const projects = createHttpProjectsApi(client);

    await projects.listPage();
    await projects.listPage({ cursor: "c 1" });

    assert.deepEqual(
      requests.map((r) => r.url),
      ["https://api.test/api/v1/projects", "https://api.test/api/v1/projects?cursor=c+1"],
    );
  });

  test("setting the documents is a PUT of the items to the run's documents", async () => {
    const { client, requests } = recordingClient({
      id: "r1",
      created_at: "t",
      files: [],
      cells: [],
    });

    await createHttpRunsApi(client).setDocuments("r1", [
      {
        id: "enriched/a.md",
        name: "a.md",
        source: "storage",
        type: "md",
        sizeBytes: 3,
        location: "enriched",
        modifiedAt: "t",
      },
    ]);

    assert.equal(requests[0].method, "PUT");
    assert.equal(requests[0].url, "https://api.test/api/v1/runs/r1/documents");
    assert.deepEqual(
      (requests[0].body as { items: { source: string; source_ref: string }[] }).items.map((i) => [
        i.source,
        i.source_ref,
      ]),
      [["storage", "enriched/a.md"]],
    );
  });

  test("versions, restore, a note on save and clearing the conversation use the run's paths", async () => {
    const { client, requests } = recordingClient(wireDefinition);
    const extraction = createHttpExtractionApi(client);
    const draft = {
      prompt: "p",
      recordTypes: [],
      output: { format: "json" as const, template: "" },
    };

    await extraction.getDefinitionVersion("r1", 2);
    await extraction.restoreDefinitionVersion("r1", 2);
    await extraction.saveDefinition("r1", draft, 3, "why");
    await extraction.clearAssistantMessages("r1");

    const base = "https://api.test/api/v1/runs/r1";
    assert.deepEqual(
      requests.map((r) => [r.method, r.url]),
      [
        ["GET", `${base}/stages/extract/definition/versions/2`],
        ["POST", `${base}/stages/extract/definition/versions/2/restore`],
        ["PUT", `${base}/stages/extract/definition`],
        ["DELETE", `${base}/extraction/assistant/messages`],
      ],
    );
    assert.equal((requests[2].body as { note: string }).note, "why");
    assert.equal((requests[2].body as { base_version: number }).base_version, 3);
  });
});
