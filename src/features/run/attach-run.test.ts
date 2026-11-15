import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { MOCK_FILES } from "@/mocks/files";
import type { MockBackend } from "@/services/mock/mock-backend";
import type { PipelineState } from "@/store/types";
import type { StageId } from "@/types/pipeline";

/**
 * The whole path a run takes, without React: the real store, the real sync,
 * and the mock backend standing in for Django. What the panels show is derived
 * from this state, so if these hold, the flow holds.
 */

// The store and the mock expect a browser: give them the two things they touch.
// The mock also hands itself to `window`, which is how the tests speed it up.
const memory = new Map<string, string>();
Object.assign(globalThis, {
  window: globalThis,
  sessionStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  },
});

const FILES = MOCK_FILES.slice(0, 2);

let store: typeof import("@/store/pipeline-store").usePipelineStore;
let selectors: typeof import("@/store/selectors");
let attachRun: typeof import("./attach-run").attachRun;
let backend: MockBackend;

const state = (): PipelineState => store.getState();
const status = (stage: StageId) => selectors.selectStageStatus(state(), stage);

async function until(condition: () => boolean, what: string) {
  for (let i = 0; i < 1000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting until ${what}`);
}

/** What <RunSync> does while a run exists. */
let detach: (() => void) | null = null;
let goneCalls = 0;
function attach() {
  const runId = state().runId;
  assert.ok(runId, "there is a run to attach to");
  detach = attachRun(runId, { onGone: () => goneCalls++ });
}

/** Select files and proceed, as the footer does on the first stage. */
async function startRun() {
  state().setSelection(FILES);
  await state().ensureRun();
  state().completeStage("select");
  attach();
  await until(() => state().connection === "open", "the live connection is open");
}

async function runToReady(stage: Exclude<StageId, "select">) {
  await state().executeStage(stage);
  await until(() => status(stage) === "ready" || status(stage) === "done", `${stage} is finished`);
}

describe("a run, from file selection to live updates", () => {
  before(async () => {
    ({ usePipelineStore: store } = await import("@/store/pipeline-store"));
    selectors = await import("@/store/selectors");
    ({ attachRun } = await import("./attach-run"));
    const mock = window.__mockBackend;
    assert.ok(mock, "the app runs on the mock backend by default");
    backend = mock;
    backend.setSpeed(0);
  });

  beforeEach(() => {
    detach?.();
    detach = null;
    goneCalls = 0;
    state().resetRun();
  });

  after(() => detach?.());

  test("proceeding from file selection creates the run", async () => {
    assert.equal(selectors.canProceedFrom(state(), "select"), false);
    state().setSelection(FILES);
    assert.equal(selectors.canProceedFrom(state(), "select"), true);
    assert.equal(state().runId, null, "selecting alone creates nothing on the server");

    await state().ensureRun();

    assert.ok(state().runId);
    assert.equal(state().runLoad, "ready");
    assert.deepEqual(
      state().runFiles.map((file) => file.sourceRef),
      FILES.map((file) => file.id),
    );
    assert.equal(status("ingest"), "idle");
  });

  test("asking twice at the same moment creates one run", async () => {
    state().setSelection(FILES);
    await Promise.all([state().ensureRun(), state().ensureRun()]);
    const runId = state().runId;
    await state().ensureRun();
    assert.equal(state().runId, runId);
  });

  test("a stage goes idle → running → ready from live updates, then done on proceed", async () => {
    await startRun();
    assert.equal(status("ingest"), "idle");

    const started = state().executeStage("ingest");
    assert.equal(status("ingest"), "running", "running from the click");
    await started;
    assert.equal(status("ingest"), "running", "still running once the server has accepted");

    await until(() => status("ingest") === "ready", "ingest is ready");
    assert.equal(selectors.canProceedFrom(state(), "ingest"), true);
    assert.ok(state().runFiles.every((file) => state().cells[file.id]?.ingest?.progress === 100));

    state().completeStage("ingest");
    assert.equal(status("ingest"), "done");
  });

  test("running an earlier stage again sends the later ones back to idle", async () => {
    await startRun();
    await runToReady("ingest");
    state().completeStage("ingest");
    await runToReady("transform");
    state().completeStage("transform");
    assert.equal(status("transform"), "done");

    await runToReady("ingest");

    assert.equal(status("ingest"), "done", "it was proceeded past before, and is finished again");
    await until(() => status("transform") === "idle", "transform reads as not run");
    assert.equal(selectors.canProceedFrom(state(), "transform"), false);
    assert.ok(
      state().runFiles.every((file) => state().cells[file.id]?.transform?.status === "stale"),
      "its files are marked out of date, and keep their old output",
    );
  });

  test("the server's refusals reach the caller, except 'already running'", async () => {
    await startRun();

    await assert.rejects(state().executeStage("transform"), (error) => {
      assert.ok(isApiError(error));
      assert.equal(error.code, "upstream_not_ready");
      return true;
    });
    assert.equal(status("transform"), "idle", "the click's 'running' is taken back");

    // Started somewhere else (another tab): this tab's click is not an error.
    const runId = state().runId;
    assert.ok(runId);
    await backend.executeStage(runId, "ingest");
    await state().executeStage("ingest");
    await until(() => status("ingest") === "ready", "the other execution is followed to the end");
  });

  test("updates lost while disconnected are caught up from the snapshot", async () => {
    await startRun();

    backend.dropConnection(40);
    assert.equal(state().connection, "reconnecting");
    const runId = state().runId;
    assert.ok(runId);
    // Another tab starts the work, so nothing here knows about it.
    await backend.executeStage(runId, "ingest");
    assert.equal(status("ingest"), "idle", "unaware of it while disconnected");

    await until(() => state().connection === "open", "the connection is back");
    await until(() => status("ingest") === "ready", "the missed work shows up");
  });

  test("after a reload, the page finds its run and work in flight carries on", async () => {
    await startRun();
    await state().executeStage("ingest");
    const runId = state().runId;

    // A reload: the connection ends, and only the persisted fields survive.
    detach?.();
    store.setState({ runFiles: [], cells: {}, runLoad: "idle", connection: "idle" });
    assert.equal(status("ingest"), "idle");

    attach();
    await until(() => state().runLoad === "ready", "the snapshot is loaded");
    assert.equal(state().runId, runId);
    assert.equal(state().runFiles.length, FILES.length);
    await until(() => status("ingest") === "ready", "the ingest that was running has finished");
  });

  test("what is persisted is the run id and the person's choices, not the run's state", async () => {
    await startRun();
    await runToReady("ingest");

    const saved = JSON.parse(memory.get("knowledge-extractor:run") ?? "null") as {
      state: Record<string, unknown>;
      version: number;
    };
    assert.equal(saved.version, 2);
    assert.deepEqual(Object.keys(saved.state).sort(), [
      "activeDocId",
      "activeSource",
      "proceededStages",
      "runId",
      "selectedFiles",
    ]);
  });

  test("a run the server no longer has is let go, and the selection stays", async () => {
    await startRun();
    const runId = state().runId;
    assert.ok(runId);
    await backend.deleteRun(runId);

    assert.equal(await state().loadRun(), "gone");
    assert.equal(state().runId, null);
    assert.equal(state().selectedFiles.length, FILES.length);
    assert.equal(status("select"), "idle", "file selection has to be proceeded from again");

    // The same thing discovered by the sync itself, on a reconnect.
    await state().ensureRun();
    attach();
    await until(() => state().connection === "open", "the live connection is open");
    const second = state().runId;
    assert.ok(second);
    await backend.deleteRun(second);
    backend.dropConnection(10);
    await until(() => goneCalls === 1, "the page is told the run is gone");
    assert.equal(state().runId, null);
  });

  test("changing the selection discards the run, on the server too", async () => {
    await startRun();
    await runToReady("ingest");
    const runId = state().runId;
    assert.ok(runId);

    state().toggleFile(FILES[0]);

    assert.equal(state().runId, null);
    assert.deepEqual(state().cells, {});
    assert.equal(status("select"), "idle");
    assert.equal(state().selectedFiles.length, FILES.length - 1);
    await assert.rejects(
      backend.getRun(runId),
      (error) => isApiError(error) && error.status === 404,
    );
  });

  test("live updates for a run that was left behind are ignored", async () => {
    await startRun();
    const first = state().runId;
    assert.ok(first);
    await backend.executeStage(first, "ingest");

    // A new selection, and a new run, while the old one is still working.
    state().setSelection(FILES.slice(0, 1));
    await state().ensureRun();
    detach?.();
    attach();
    await until(() => state().connection === "open", "the live connection is open");
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.notEqual(state().runId, first);
    assert.equal(status("ingest"), "idle");
    assert.deepEqual(Object.keys(state().cells), [state().runFiles[0].id]);
  });
});
