import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "@/lib/api/api-error";
import type { Services } from "../contracts";
import { createMockServices } from "../mock";
import { MockBackend } from "../mock/mock-backend";
import { describeFailure, runStudioFlow, StudioFlowError } from "./studio-flow";

/**
 * `npm run test:api` runs this flow against the real backend. Here it runs
 * against the mock, which follows the same contract, so the flow's own
 * checks are tested without a server.
 */

const mockServices = () =>
  createMockServices(new MockBackend({ speed: 0, storage: null, persistentStorage: null }));

describe("runStudioFlow", () => {
  test("walks every step against a backend that keeps the contract", async () => {
    const lines: string[] = [];

    await runStudioFlow(mockServices(), { log: (line) => lines.push(line), eventTimeoutMs: 5000 });

    assert.equal(lines.length, 29);
    assert.ok(
      lines.every((line) => / ok /.test(line)),
      lines.join("\n"),
    );
    assert.match(lines[0], /^ 1\. List documents/);
    assert.match(lines.at(-1)!, /^29. Every live update was readable/);
  });

  test("stops at the first call the server refuses, naming the step and the answer", async () => {
    const services = mockServices();
    let created = 0;
    services.catalog.list = async () => {
      throw new ApiError({
        status: 401,
        code: "unauthenticated",
        message: "Authentication is required.",
        requestId: "req-1",
      });
    };
    const create = services.workspaces.create;
    services.workspaces.create = (input) => {
      created++;
      return create(input);
    };
    const lines: string[] = [];

    const failure = await runStudioFlow(services, { log: (line) => lines.push(line) }).then(
      () => assert.fail("the flow passed"),
      (error: unknown) => error,
    );

    assert.ok(failure instanceof StudioFlowError);
    assert.equal(failure.step, "1. List documents");
    assert.match(failure.message, /HTTP 401 unauthenticated: Authentication is required\./);
    assert.match(failure.message, /request id: req-1/);
    assert.deepEqual(lines.length, 1);
    assert.match(lines[0], /FAILED$/);
    assert.equal(created, 0);
  });

  test("deletes the workspace it created when a later step fails", async () => {
    const services: Services = mockServices();
    let deleted: string | null = null;
    services.extraction.getDefinition = async () => {
      throw new ApiError({ status: 500, code: "http_500", message: "Server Error" });
    };
    const remove = services.workspaces.remove;
    services.workspaces.remove = async (workspaceId) => {
      deleted = workspaceId;
      await remove(workspaceId);
    };

    await assert.rejects(
      runStudioFlow(services, { log: () => {}, eventTimeoutMs: 5000 }),
      (error: unknown) =>
        error instanceof StudioFlowError && error.step === "9. Read the definition",
    );
    assert.ok(deleted, "the workspace was deleted");
  });

  test("fails when the server breaks the contract", async () => {
    const services = mockServices();
    const getRun = services.runs.getRun;
    services.runs.getRun = async (runId, signal) => {
      const run = await getRun(runId, signal);
      return { ...run, cells: run.cells.map((c) => ({ ...c, status: "pending" as const })) };
    };

    await assert.rejects(
      runStudioFlow(services, { log: () => {}, eventTimeoutMs: 5000 }),
      (error: unknown) =>
        error instanceof StudioFlowError &&
        error.step === "17. Read the snapshot" &&
        /Not every extract cell/.test(error.message),
    );
  });
});

describe("describeFailure", () => {
  test("gives the status, the code, the message and the request id of an ApiError", () => {
    const text = describeFailure(
      new ApiError({
        status: 409,
        code: "revision_conflict",
        message: "Stale revision.",
        details: { current: 4 },
        requestId: "req-9",
      }),
    );
    assert.equal(
      text,
      'HTTP 409 revision_conflict: Stale revision.\ndetails: {"current":4}\nrequest id: req-9',
    );
  });

  test("says when no response arrived", () => {
    const text = describeFailure(
      new ApiError({
        status: 0,
        code: "network_error",
        message: "Could not reach the server.",
        cause: new Error("fetch failed"),
      }),
    );
    assert.equal(
      text,
      "no HTTP status network_error: Could not reach the server.\ncause: fetch failed",
    );
  });

  test("gives the message of any other error", () => {
    assert.equal(
      describeFailure(new Error("No assistant.done within 60 s.")),
      "No assistant.done within 60 s.",
    );
  });
});
