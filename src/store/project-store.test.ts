import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { MOCK_DOCUMENTS } from "@/mocks/documents";
import type { MockBackend } from "@/services/mock/mock-backend";
import type { Project } from "@/services/contracts";
import type { PipelineState } from "./types";

/**
 * Studio's store, opened by project id, against the mock backend. A "tab" is
 * a store; a new browser context is a new store with empty sessionStorage.
 */

/** A Storage in a Map, with `key()` and `length` so stored keys can be listed. */
function memoryStorage() {
  const saved = new Map<string, string>();
  return {
    saved,
    get length() {
      return saved.size;
    },
    key: (index: number) => [...saved.keys()][index] ?? null,
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => void saved.set(key, value),
    removeItem: (key: string) => void saved.delete(key),
  };
}

const session = memoryStorage();
Object.assign(globalThis, {
  window: globalThis,
  sessionStorage: session,
  localStorage: memoryStorage(),
});

const KEY = "test-studio:project";
const DOCS = MOCK_DOCUMENTS.slice(0, 3);

type Store = import("./pipeline-store").RunStore;
let createProjectRunStore: typeof import("./pipeline-store").createProjectRunStore;
let createRunStore: typeof import("./pipeline-store").createRunStore;
let attachRun: typeof import("@/features/run/attach-run").attachRun;
let services: typeof import("@/services").services;
let backend: MockBackend;

const detachers: (() => void)[] = [];

async function until(condition: () => boolean, what: string) {
  for (let i = 0; i < 1000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting until ${what}`);
}

/** A tab: a new store, hydrated, as <StoreHydrator> leaves it. */
async function newTab(): Promise<Store> {
  const store = createProjectRunStore(KEY);
  await store.persist.rehydrate();
  return store;
}

/** What <RunSync> does once the project's run is known. */
async function attach(store: Store) {
  const runId = store.getState().runId;
  assert.ok(runId, "the project's run is loaded");
  detachers.push(attachRun(store, runId, { onGone: () => {} }));
  await until(() => store.getState().connection === "open", "the live connection is open");
}

async function openedOn(project: Project): Promise<Store> {
  const store = await newTab();
  await store.getState().openProject(project.id);
  assert.equal(store.getState().projectLoad, "ready");
  return store;
}

const refs = (state: PipelineState) => state.runFiles.map((file) => file.sourceRef).sort();
const selectedIds = (state: PipelineState) => state.selectedFiles.map((file) => file.id).sort();
const ids = (files: readonly { id: string }[]) => files.map((file) => file.id).sort();

describe("a Studio store opened by project id", () => {
  before(async () => {
    ({ createProjectRunStore, createRunStore } = await import("./pipeline-store"));
    ({ attachRun } = await import("@/features/run/attach-run"));
    ({ services } = await import("@/services"));
    const mock = window.__mockBackend;
    assert.ok(mock, "the app runs on the mock backend by default");
    backend = mock;
    backend.setSpeed(0);
  });

  beforeEach(() => {
    while (detachers.length) detachers.pop()?.();
    session.saved.clear();
  });

  after(() => {
    while (detachers.length) detachers.pop()?.();
  });

  test("loads the project, then its run; the selection is the run's files", async () => {
    const project = await services.projects.create({ name: "ADRs" });
    const store = await newTab();

    const opening = store.getState().openProject(project.id);
    assert.equal(store.getState().projectLoad, "loading");
    assert.equal(store.getState().projectId, project.id);
    await opening;

    const state = store.getState();
    assert.equal(state.projectLoad, "ready");
    assert.equal(state.project?.name, "ADRs");
    assert.equal(state.runId, project.runId);
    assert.equal(state.runLoad, "ready");
    assert.deepEqual(state.selectedFiles, []);
  });

  test("opening extraction makes the selection the run's documents, and the run stays", async () => {
    const project = await services.projects.create({ name: "Policies" });
    const store = await openedOn(project);

    store.getState().setSelection(DOCS);
    assert.equal(store.getState().runId, project.runId, "choosing keeps the project's run");
    assert.deepEqual(store.getState().runFiles, [], "and sends nothing yet");

    await store.getState().ensureRun();

    assert.equal(store.getState().runId, project.runId);
    assert.deepEqual(refs(store.getState()), ids(DOCS));
    assert.deepEqual(selectedIds(store.getState()), ids(DOCS));
    assert.deepEqual(
      ids((await services.runs.getRun(project.runId)).files.map((f) => ({ id: f.sourceRef }))),
      ids(DOCS),
    );

    // Choosing fewer keeps the files that stay, with their ids.
    const kept = store.getState().runFiles.find((file) => file.sourceRef === DOCS[0].id);
    store.getState().toggleFile(DOCS[2]);
    await store.getState().ensureRun();
    assert.equal(store.getState().runId, project.runId);
    assert.deepEqual(refs(store.getState()), ids(DOCS.slice(0, 2)));
    assert.equal(
      store.getState().runFiles.find((file) => file.sourceRef === DOCS[0].id)?.id,
      kept?.id,
    );
  });

  test("nothing of the run is kept in the browser: a new context gets the same state", async () => {
    const project = await services.projects.create({ name: "Contracts" });
    const first = await openedOn(project);
    first.getState().setSelection(DOCS.slice(0, 2));
    await first.getState().ensureRun();

    const saved = JSON.parse(session.saved.get(KEY) ?? "null") as { state: object } | null;
    assert.deepEqual(saved?.state ?? {}, {}, "no run id, no selection");

    session.saved.clear(); // a new browser context
    const second = await openedOn(project);
    assert.equal(second.getState().runId, project.runId);
    assert.deepEqual(refs(second.getState()), refs(first.getState()));
    assert.deepEqual(selectedIds(second.getState()), ids(DOCS.slice(0, 2)));
    const fileId = second.getState().runFiles[0].id;
    assert.ok(second.getState().cells[fileId]?.extract, "the run's cells come with it");
  });

  test("two projects in two tabs do not disturb each other", async () => {
    const a = await services.projects.create({ name: "A" });
    const b = await services.projects.create({ name: "B" });
    const tabA = await openedOn(a);
    const tabB = await openedOn(b);
    await attach(tabA);
    await attach(tabB);

    tabA.getState().setSelection(DOCS.slice(0, 1));
    await tabA.getState().ensureRun();
    tabB.getState().setSelection(DOCS.slice(1, 3));
    await tabB.getState().ensureRun();
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(tabA.getState().runId, a.runId);
    assert.equal(tabB.getState().runId, b.runId);
    assert.deepEqual(refs(tabA.getState()), ids(DOCS.slice(0, 1)));
    assert.deepEqual(refs(tabB.getState()), ids(DOCS.slice(1, 3)));
  });

  test("a change of documents elsewhere fetches the snapshot again (run.changed)", async () => {
    const project = await services.projects.create({ name: "Shared" });
    const here = await openedOn(project);
    await attach(here);
    const there = await openedOn(project);

    there.getState().setSelection(DOCS.slice(0, 2));
    await there.getState().ensureRun();

    await until(() => here.getState().runFiles.length === 2, "the new documents arrive");
    assert.deepEqual(refs(here.getState()), ids(DOCS.slice(0, 2)));
    assert.deepEqual(selectedIds(here.getState()), ids(DOCS.slice(0, 2)), "the selection follows");
  });

  test("an unknown project is gone, not an error", async () => {
    const store = await newTab();
    await store.getState().openProject("project_does_not_exist");
    assert.equal(store.getState().projectLoad, "gone");
    assert.equal(store.getState().runId, null);
  });

  test("a project deleted while open is gone", async () => {
    const project = await services.projects.create({ name: "Short-lived" });
    const store = await openedOn(project);
    await services.projects.remove(project.id);

    assert.equal(await store.getState().loadRun(), "gone");
    assert.equal(store.getState().projectLoad, "gone");
  });

  test("the active document and source tab are kept per project, in this tab only", async () => {
    const a = await services.projects.create({ name: "With a document open" });
    const b = await services.projects.create({ name: "Another" });
    const store = await openedOn(a);
    store.getState().setActiveDoc("file_1");

    await store.getState().openProject(b.id);
    assert.equal(store.getState().activeDocId, null, "another project starts without it");
    assert.equal(store.getState().runId, b.runId);

    await store.getState().openProject(a.id);
    assert.equal(store.getState().activeDocId, "file_1", "back on the first, it is restored");
    assert.equal(store.getState().runId, a.runId);
  });

  test("sign-out removes every project's conveniences from the tab", async () => {
    const { clearProjectConveniences } = await import("./slices/project-slice");
    const project = await services.projects.create({ name: "Signed out" });
    const store = await openedOn(project);
    store.getState().setActiveDoc("file_1");
    session.setItem("unrelated", "kept");
    assert.ok(session.saved.has(`${KEY}:${project.id}`));

    clearProjectConveniences(KEY);

    assert.equal(session.saved.has(`${KEY}:${project.id}`), false);
    assert.equal(session.getItem("unrelated"), "kept");
  });

  test("opening the project already open does nothing; a later opening wins", async () => {
    const a = await services.projects.create({ name: "First" });
    const b = await services.projects.create({ name: "Second" });
    const store = await openedOn(a);
    store.getState().setSelection(DOCS.slice(0, 1));

    await store.getState().openProject(a.id);
    assert.equal(store.getState().selectedFiles.length, 1, "the same project is not reloaded");

    const slow = store.getState().openProject(b.id);
    const fast = store.getState().openProject(a.id);
    await Promise.all([slow, fast]);
    assert.equal(store.getState().projectId, a.id);
    assert.equal(store.getState().runId, a.runId);
  });

  test("the pipeline's store has no project, and still lets go of its run on a new selection", async () => {
    const store = createRunStore("test-pipeline:run");
    await store.persist.rehydrate();
    await store.getState().openProject("anything");
    assert.equal(store.getState().projectId, null);

    store.getState().setSelection(DOCS.slice(0, 1));
    await store.getState().ensureRun();
    assert.ok(store.getState().runId);
    store.getState().clearSelection();
    assert.equal(store.getState().runId, null);
  });
});
