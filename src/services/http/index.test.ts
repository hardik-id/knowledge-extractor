import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createApiClient, createMemoryTokenProvider } from "@/lib/api";
import { createHttpClient } from "@/lib/api/http-client";
import {
  createHttpExtractionApi,
  createHttpProjectsApi,
  createHttpRunsApi,
  createHttpStatusApi,
  createHttpTemplatesApi,
} from "./index";

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
  chunking: { strategy: "auto" as const, size: null },
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
      chunking: { strategy: "auto" as const, size: null },
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

describe("templates", () => {
  test("the templates are read from /definition-templates", async () => {
    const { client, requests } = recordingClient({
      items: [
        {
          id: "blank",
          name: "Blank",
          description: "Nothing set up.",
          definition: {
            prompt: "",
            record_types: [],
            output: { format: "markdown", template: "" },
            chunking: { strategy: "auto" as const, size: null },
          },
        },
      ],
      next: null,
    });

    const templates = await createHttpTemplatesApi(client).list();

    assert.deepEqual(
      requests.map((r) => [r.method, r.url]),
      [["GET", "https://api.test/api/v1/definition-templates"]],
    );
    assert.equal(templates[0].id, "blank");
    assert.deepEqual(templates[0].definition.recordTypes, []);
  });

  test("a project made from a template sends template_id; without one it sends none", async () => {
    const { client, requests } = recordingClient({
      id: "p1",
      name: "N",
      description: "",
      run_id: "r1",
      document_count: 0,
      configuration_version: 1,
      created_at: "t",
      updated_at: "t",
    });
    const projects = createHttpProjectsApi(client);

    await projects.create({ name: "N", templateId: "skill" });
    await projects.create({ name: "N" });

    assert.deepEqual(requests[0].body, { name: "N", template_id: "skill" });
    assert.deepEqual(requests[1].body, { name: "N" });
  });
});

describe("createHttpStatusApi", () => {
  const body = {
    environment: "local",
    parts: [
      { id: "worker", mode: "real", label: "Worker", state: "ok", checked_at: null, problem: null },
    ],
  };
  const clientFor = (respond: () => Response) =>
    createApiClient({
      baseUrl: "https://api.test/api/v1",
      tokens: createMemoryTokenProvider({ initialToken: "t" }),
      fetch: async () => respond(),
    });

  test("get reads the status", async () => {
    const api = createHttpStatusApi(clientFor(() => Response.json(body)));
    assert.equal((await api.get())?.parts[0].id, "worker");
  });

  test("a 404 means the backend does not report its status: null, not an error", async () => {
    const api = createHttpStatusApi(
      clientFor(() => Response.json({ code: "not_found", message: "no" }, { status: 404 })),
    );
    assert.equal(await api.get(), null);
    assert.equal(await api.test(), null);
  });

  test("any other failure is still an error", async () => {
    const api = createHttpStatusApi(
      clientFor(() => Response.json({ code: "error", message: "x" }, { status: 500 })),
    );
    await assert.rejects(api.get());
  });

  test("test says whether the answer came from the store", async () => {
    const cached = createHttpStatusApi(
      clientFor(() => Response.json(body, { headers: { "X-Status-Test": "cached" } })),
    );
    assert.equal((await cached.test())?.cached, true);
    const fresh = createHttpStatusApi(clientFor(() => Response.json(body)));
    assert.equal((await fresh.test())?.cached, false);
  });
});
