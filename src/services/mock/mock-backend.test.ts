import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { MOCK_FILES } from "@/mocks/files";
import type { CellStatus, Run, StageCell, WorkStageId } from "../contracts";
import { MockBackend } from "./mock-backend";

/**
 * The mock has to follow the same rules as the real backend, or the UI is
 * built against behaviour that will not exist. These tests pin those rules.
 */

const FILES = MOCK_FILES.slice(0, 2);

const fastBackend = (storage: Pick<Storage, "getItem" | "setItem"> | null = null) =>
  new MockBackend({ speed: 0, storage });

async function until(condition: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 500; i++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting until ${what}`);
}

const statuses = (run: Run, stage: WorkStageId): CellStatus[] =>
  run.cells.filter((cell) => cell.stage === stage).map((cell) => cell.status);

async function runStage(backend: MockBackend, runId: string, stage: WorkStageId) {
  await backend.executeStage(runId, stage);
  await until(
    async () =>
      statuses(await backend.getRun(runId), stage).every((status) => status === "succeeded"),
    `${stage} has finished`,
  );
}

const rejectsWithCode = (promise: Promise<unknown>, code: string, status: number) =>
  assert.rejects(promise, (error) => {
    assert.ok(isApiError(error), "rejects with an ApiError");
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });

describe("MockBackend", () => {
  test("a new run has a pending cell for every file and stage, under its own file ids", async () => {
    const run = await fastBackend().createRun(FILES);

    assert.equal(run.files.length, 2);
    assert.equal(run.cells.length, 2 * 6);
    assert.ok(run.cells.every((cell) => cell.status === "pending"));
    assert.deepEqual(
      run.files.map((file) => file.sourceRef),
      FILES.map((file) => file.id),
    );
    assert.notEqual(run.files[0].id, FILES[0].id);
  });

  test("a stage that is running can't be started again (409)", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);

    await backend.executeStage(run.id, "ingest");
    await rejectsWithCode(backend.executeStage(run.id, "ingest"), "execution_in_progress", 409);
  });

  test("a stage can't run before the one before it has finished (422)", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);

    await rejectsWithCode(backend.executeStage(run.id, "transform"), "upstream_not_ready", 422);
  });

  test("running a stage again makes the later stages out of date", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    await runStage(backend, run.id, "ingest");
    await runStage(backend, run.id, "transform");

    await backend.executeStage(run.id, "ingest");
    const after = await backend.getRun(run.id);

    assert.deepEqual(statuses(after, "transform"), ["stale", "stale"]);
    assert.deepEqual(statuses(after, "classify"), ["pending", "pending"], "never ran: not stale");
  });

  test("an unknown run is a 404", async () => {
    await rejectsWithCode(fastBackend().getRun("run_missing"), "run_not_found", 404);
  });

  test("output is there once a file has succeeded, and not before", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    const fileId = run.files[0].id;
    await runStage(backend, run.id, "ingest");

    await rejectsWithCode(backend.getOutput(run.id, fileId, "transform"), "output_not_found", 404);
    await runStage(backend, run.id, "transform");

    const output = await backend.getOutput(run.id, fileId, "transform");
    assert.equal(output.contentType, "text/markdown");
    assert.ok(output.text.length > 0);
  });

  test("a failing file ends as failed with an error, the others succeed", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    backend.failNext("ingest");
    await backend.executeStage(run.id, "ingest");
    await until(
      async () =>
        statuses(await backend.getRun(run.id), "ingest").every(
          (s) => s !== "queued" && s !== "running",
        ),
      "ingest has settled",
    );

    const cells = (await backend.getRun(run.id)).cells.filter((cell) => cell.stage === "ingest");
    assert.deepEqual(
      cells.map((cell) => cell.status),
      ["failed", "succeeded"],
    );
    assert.equal(cells[0].error?.code, "mock_failure");
  });

  test("subscribers get every change, each newer than the last", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES.slice(0, 1));
    const received: StageCell[] = [];
    let opened = 0;
    const unsubscribe = backend.subscribe(run.id, {
      onCell: (cell) => received.push(cell),
      onOpen: () => opened++,
    });
    await until(() => opened === 1, "the subscription is open");

    await runStage(backend, run.id, "ingest");
    unsubscribe();

    assert.equal(received[0].status, "queued");
    assert.equal(received.at(-1)?.status, "succeeded");
    const times = received.map((cell) => Date.parse(cell.updatedAt));
    assert.deepEqual(
      times,
      [...times].sort((a, b) => a - b),
    );
    assert.equal(new Set(times).size, times.length, "no two changes share a timestamp");
  });

  test("changes during a dropped connection are lost, and reopening says so", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES.slice(0, 1));
    const received: StageCell[] = [];
    let opened = 0;
    backend.subscribe(run.id, { onCell: (cell) => received.push(cell), onOpen: () => opened++ });
    await until(() => opened === 1, "the subscription is open");

    backend.dropConnection(30);
    await runStage(backend, run.id, "ingest");
    assert.deepEqual(received, [], "nothing arrives while disconnected");

    await until(() => opened === 2, "the subscription has reopened");
    const snapshot = await backend.getRun(run.id);
    assert.deepEqual(
      statuses(snapshot, "ingest"),
      ["succeeded"],
      "the snapshot has what was missed",
    );
  });

  test("after a reload, the run is found again and unfinished work carries on", async () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
    const before = fastBackend(storage);
    const run = await before.createRun(FILES);
    await before.executeStage(run.id, "ingest");

    // A second backend on the same storage plays the page after a reload.
    const after = fastBackend(storage);
    await until(
      async () =>
        statuses(await after.getRun(run.id), "ingest").every((status) => status === "succeeded"),
      "the restored backend has finished the ingest",
    );
  });
});
