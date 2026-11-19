import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHttpClient } from "@/lib/api/http-client";
import { createHttpRunsApi } from "./index";

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
