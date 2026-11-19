import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { MOCK_DOCUMENTS } from "@/mocks/documents";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import { MOCK_FILES } from "@/mocks/files";
import type { RunEventHandlers } from "../contracts";
import { MockBackend } from "./mock-backend";

const DOCS = MOCK_DOCUMENTS.slice(0, 3);

/** A Storage that lives in a Map, so a test can "close the tab" by dropping one and keeping the other. */
const memoryStorage = () => {
  const saved = new Map<string, string>();
  return {
    saved,
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => void saved.set(key, value),
    removeItem: (key: string) => void saved.delete(key),
  };
};

const backendOn = (
  storage: ReturnType<typeof memoryStorage> | null = null,
  persistentStorage: ReturnType<typeof memoryStorage> | null = null,
) => new MockBackend({ speed: 0, storage, persistentStorage });

const rejectsWithCode = (promise: Promise<unknown>, code: string, status: number) =>
  assert.rejects(promise, (error) => {
    assert.ok(isApiError(error), "rejects with an ApiError");
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });

describe("mock projects", () => {
  test("a project is made with an empty run of its own", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "  ADRs  ", description: "Decisions" });

    assert.equal(project.name, "ADRs");
    assert.equal(project.description, "Decisions");
    assert.equal(project.documentCount, 0);
    assert.equal(project.configurationVersion, null);
    const run = await backend.getRun(project.runId);
    assert.deepEqual([run.files, run.cells], [[], []]);
    assert.deepEqual(await backend.getProject(project.id), project);
  });

  test("a blank or too long name is a 422, an unknown project a 404", async () => {
    const backend = backendOn();
    await rejectsWithCode(backend.createProject({ name: "   " }), "validation_error", 422);
    await rejectsWithCode(
      backend.createProject({ name: "x".repeat(121) }),
      "validation_error",
      422,
    );
    await backend.createProject({ name: "x".repeat(120) });
    await rejectsWithCode(backend.getProject("nope"), "project_not_found", 404);
    await rejectsWithCode(backend.updateProject("nope", { name: "a" }), "project_not_found", 404);
    await rejectsWithCode(backend.deleteProject("nope"), "project_not_found", 404);
  });

  test("rename and describe change only what is sent", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "One", description: "First" });

    const renamed = await backend.updateProject(project.id, { name: "Two" });
    assert.deepEqual([renamed.name, renamed.description], ["Two", "First"]);
    const described = await backend.updateProject(project.id, { description: "" });
    assert.deepEqual([described.name, described.description], ["Two", ""]);
    await rejectsWithCode(backend.updateProject(project.id, { name: "" }), "validation_error", 422);
  });

  test("the list has the project with the latest activity first", async () => {
    const backend = backendOn();
    const a = await backend.createProject({ name: "A" });
    const b = await backend.createProject({ name: "B" });
    assert.deepEqual(
      (await backend.listProjects()).map((p) => p.name),
      ["B", "A"],
    );

    await backend.setDocuments(a.runId, DOCS.slice(0, 1));
    const listed = await backend.listProjects();
    assert.deepEqual(
      listed.map((p) => p.id),
      [a.id, b.id],
    );
    assert.equal(listed[0].documentCount, 1);
  });

  test("the list comes in pages with a cursor to the next", async () => {
    const backend = backendOn();
    for (const name of ["A", "B", "C"]) await backend.createProject({ name });
    const first = await backend.listProjectsPage({ pageSize: 2 });
    assert.deepEqual(
      first.items.map((p) => p.name),
      ["C", "B"],
    );
    assert.ok(first.next);
    const second = await backend.listProjectsPage({ cursor: first.next, pageSize: 2 });
    assert.deepEqual(
      second.items.map((p) => p.name),
      ["A"],
    );
    assert.equal(second.next, null);
  });

  test("a project's run can't be deleted; deleting the project removes the run", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    await rejectsWithCode(backend.deleteRun(project.runId), "run_belongs_to_project", 409);
    assert.equal((await backend.getRun(project.runId)).id, project.runId);

    await backend.deleteProject(project.id);
    assert.deepEqual(await backend.listProjects(), []);
    await rejectsWithCode(backend.getRun(project.runId), "run_not_found", 404);
  });
});

describe("mock documents of a run", () => {
  test("a document that stays keeps its file, one that goes loses everything, a new one is pending", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    const first = await backend.setDocuments(project.runId, DOCS.slice(0, 2));
    assert.deepEqual(
      first.files.map((f) => f.sourceRef),
      DOCS.slice(0, 2).map((d) => d.id),
    );
    assert.equal(first.cells.length, 2);
    assert.ok(first.cells.every((c) => c.stage === "extract" && c.status === "pending"));

    // Records on the file that will stay.
    const stays = first.files[1];
    const dropped = first.files[0];
    await backend.addRecord(project.runId, stays.id, { recordTypeId: "rt-adr", span: null }, 0);

    const second = await backend.setDocuments(project.runId, [DOCS[1], DOCS[2]]);
    assert.equal(second.files[0].id, stays.id);
    assert.notEqual(second.files[1].id, dropped.id);
    assert.deepEqual(
      second.files.map((f) => f.sourceRef),
      [DOCS[1].id, DOCS[2].id],
    );
    assert.ok(second.cells.every((c) => second.files.some((f) => f.id === c.fileId)));
    assert.equal(second.cells.length, 2);
    assert.equal((await backend.getFileExtraction(project.runId, stays.id)).records.length, 1);
    await rejectsWithCode(
      backend.getFileExtraction(project.runId, dropped.id),
      "extraction_not_found",
      404,
    );
    assert.equal((await backend.getProject(project.id)).documentCount, 2);
  });

  test("the configuration and the conversation stay when the documents change", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    await backend.setDocuments(project.runId, DOCS.slice(0, 1));
    const definition = await backend.getDefinition(project.runId);
    await backend.saveDefinition(project.runId, { ...definition, prompt: "Mine" }, 1);

    await backend.setDocuments(project.runId, DOCS.slice(1, 2));
    assert.equal((await backend.getDefinition(project.runId)).prompt, "Mine");
  });

  test("an empty list empties the run; other files than documents are refused", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    await backend.setDocuments(project.runId, DOCS.slice(0, 1));
    assert.deepEqual((await backend.setDocuments(project.runId, [])).files, []);
    await rejectsWithCode(
      backend.setDocuments(project.runId, [MOCK_FILES[0]]),
      "mixed_sources",
      422,
    );
    await rejectsWithCode(backend.setDocuments("nope", DOCS), "run_not_found", 404);
  });

  test("subscribers hear run.changed", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    let changed = 0;
    const handlers: RunEventHandlers = { onCell: () => {}, onRunChanged: () => changed++ };
    const stop = backend.subscribe(project.runId, handlers);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await backend.setDocuments(project.runId, DOCS.slice(0, 1));
    assert.equal(changed, 1);
    stop();
    await backend.setDocuments(project.runId, DOCS.slice(0, 2));
    assert.equal(changed, 1);
  });
});

describe("mock configuration versions", () => {
  async function projectWithVersions() {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    const v1 = await backend.getDefinition(project.runId);
    const v2 = await backend.saveDefinition(
      project.runId,
      { ...v1, prompt: "Second" },
      v1.version,
      " Tightened the prompt ",
    );
    return { backend, project, v1, v2 };
  }

  test("a save carries a note and a time; the project counts the version", async () => {
    const { backend, project, v1, v2 } = await projectWithVersions();
    assert.equal(v1.note, "");
    assert.equal(v2.version, 2);
    assert.equal(v2.note, "Tightened the prompt");
    assert.ok(v2.createdAt >= v1.createdAt);
    assert.equal((await backend.getProject(project.id)).configurationVersion, 2);
  });

  test("the versions are listed newest first with their counts and read one by one", async () => {
    const { backend, project, v1, v2 } = await projectWithVersions();
    const list = await backend.listDefinitionVersions(project.runId);
    assert.deepEqual(
      list.map((v) => [v.version, v.note]),
      [
        [2, "Tightened the prompt"],
        [1, ""],
      ],
    );
    assert.equal(list[0].recordTypeCount, DEFAULT_EXTRACTION_DEFINITION.recordTypes.length);
    assert.equal(
      list[0].fieldCount,
      DEFAULT_EXTRACTION_DEFINITION.recordTypes.flatMap((t) => t.fields).length,
    );
    assert.equal((await backend.getDefinitionVersion(project.runId, 1)).prompt, v1.prompt);
    assert.equal((await backend.getDefinitionVersion(project.runId, 2)).prompt, v2.prompt);
    await rejectsWithCode(
      backend.getDefinitionVersion(project.runId, 9),
      "definition_version_not_found",
      404,
    );
  });

  test("restoring saves a copy as the newest version and keeps the old ones", async () => {
    const { backend, project, v1 } = await projectWithVersions();
    const restored = await backend.restoreDefinitionVersion(project.runId, 1);
    assert.equal(restored.version, 3);
    assert.equal(restored.note, "Restored from version 1");
    assert.equal(restored.prompt, v1.prompt);
    assert.equal((await backend.getDefinition(project.runId)).version, 3);
    assert.equal((await backend.listDefinitionVersions(project.runId)).length, 3);
    assert.equal((await backend.getDefinitionVersion(project.runId, 2)).prompt, "Second");
    await rejectsWithCode(
      backend.restoreDefinitionVersion(project.runId, 7),
      "definition_version_not_found",
      404,
    );
  });

  test("a note over 200 characters is an invalid definition", async () => {
    const { backend, project, v2 } = await projectWithVersions();
    await rejectsWithCode(
      backend.saveDefinition(project.runId, v2, 2, "x".repeat(201)),
      "invalid_definition",
      422,
    );
    await backend.saveDefinition(project.runId, v2, 2, "x".repeat(200));
  });
});

describe("mock conversation", () => {
  test("clearing removes every message, keeps the definition and tells subscribers", async () => {
    const backend = backendOn();
    const project = await backend.createProject({ name: "P" });
    const definition = await backend.getDefinition(project.runId);
    let cleared = 0;
    backend.subscribe(project.runId, { onCell: () => {}, onAssistantCleared: () => cleared++ });
    await new Promise((resolve) => setTimeout(resolve, 5));

    await backend.sendAssistantMessage(project.runId, "Add a field for the owner", definition);
    await rejectsWithCode(backend.clearAssistantMessages(project.runId), "assistant_busy", 409);
    for (let i = 0; i < 500; i++) {
      const messages = await backend.getAssistantMessages(project.runId);
      if (messages.every((m) => m.status === "done")) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal((await backend.getAssistantMessages(project.runId)).length, 2);

    await backend.clearAssistantMessages(project.runId);
    assert.deepEqual(await backend.getAssistantMessages(project.runId), []);
    assert.equal((await backend.getDefinition(project.runId)).version, definition.version);
    assert.equal(cleared, 1);
  });
});

describe("mock storage of projects", () => {
  test("a project is still there when the tab's storage is cleared, and not after clearing local data", async () => {
    const tab = memoryStorage();
    const local = memoryStorage();
    const before = backendOn(tab, local);
    const project = await before.createProject({ name: "Kept", description: "d" });
    await before.setDocuments(project.runId, DOCS.slice(0, 2));
    const definition = await before.getDefinition(project.runId);
    await before.saveDefinition(project.runId, definition, 1, "Saved");

    // The tab is closed: its sessionStorage is gone, localStorage is not.
    const after = backendOn(memoryStorage(), local);
    const [found] = await after.listProjects();
    assert.equal(found.name, "Kept");
    assert.equal(found.documentCount, 2);
    assert.equal(found.configurationVersion, 2);
    assert.equal((await after.getRun(project.runId)).files.length, 2);
    assert.equal((await after.listDefinitionVersions(project.runId)).length, 2);

    after.reset();
    assert.equal(local.saved.size, 0);
    assert.deepEqual(await backendOn(memoryStorage(), local).listProjects(), []);
  });

  test("a run that belongs to no project stays in the tab's storage only", async () => {
    const tab = memoryStorage();
    const local = memoryStorage();
    const backend = backendOn(tab, local);
    const run = await backend.createRun(MOCK_FILES.slice(0, 1));

    assert.equal(local.saved.size, 0);
    assert.equal((await backendOn(tab, local).getRun(run.id)).id, run.id);
    await assert.rejects(backendOn(memoryStorage(), local).getRun(run.id));
  });

  test("deleting the project removes it from the storage", async () => {
    const local = memoryStorage();
    const backend = backendOn(null, local);
    const project = await backend.createProject({ name: "Gone" });
    await backend.deleteProject(project.id);
    assert.deepEqual(await backendOn(null, local).listProjects(), []);
  });
});
