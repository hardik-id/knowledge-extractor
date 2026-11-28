import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { MOCK_DOCUMENTS } from "@/mocks/documents";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import { MOCK_FILES } from "@/mocks/files";
import { MOCK_TEMPLATES } from "@/mocks/templates";
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

describe("mock workspaces", () => {
  test("a workspace is made with an empty run of its own", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "  ADRs  ", description: "Decisions" });

    assert.equal(workspace.name, "ADRs");
    assert.equal(workspace.description, "Decisions");
    assert.equal(workspace.documentCount, 0);
    assert.equal(workspace.configurationVersion, 1);
    const run = await backend.getRun(workspace.runId);
    assert.deepEqual([run.files, run.cells], [[], []]);
    assert.deepEqual(await backend.getWorkspace(workspace.id), workspace);
  });

  test("a blank or too long name is a 422, an unknown workspace a 404", async () => {
    const backend = backendOn();
    await rejectsWithCode(backend.createWorkspace({ name: "   " }), "validation_error", 422);
    await rejectsWithCode(
      backend.createWorkspace({ name: "x".repeat(121) }),
      "validation_error",
      422,
    );
    await backend.createWorkspace({ name: "x".repeat(120) });
    await rejectsWithCode(backend.getWorkspace("nope"), "workspace_not_found", 404);
    await rejectsWithCode(
      backend.updateWorkspace("nope", { name: "a" }),
      "workspace_not_found",
      404,
    );
    await rejectsWithCode(backend.deleteWorkspace("nope"), "workspace_not_found", 404);
  });

  test("rename and describe change only what is sent", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "One", description: "First" });

    const renamed = await backend.updateWorkspace(workspace.id, { name: "Two" });
    assert.deepEqual([renamed.name, renamed.description], ["Two", "First"]);
    const described = await backend.updateWorkspace(workspace.id, { description: "" });
    assert.deepEqual([described.name, described.description], ["Two", ""]);
    await rejectsWithCode(
      backend.updateWorkspace(workspace.id, { name: "" }),
      "validation_error",
      422,
    );
  });

  test("the list has the workspace with the latest activity first", async () => {
    const backend = backendOn();
    const a = await backend.createWorkspace({ name: "A" });
    const b = await backend.createWorkspace({ name: "B" });
    assert.deepEqual(
      (await backend.listWorkspaces()).map((p) => p.name),
      ["B", "A"],
    );

    await backend.setDocuments(a.runId, DOCS.slice(0, 1));
    const listed = await backend.listWorkspaces();
    assert.deepEqual(
      listed.map((p) => p.id),
      [a.id, b.id],
    );
    assert.equal(listed[0].documentCount, 1);
  });

  test("the list comes in pages with a cursor to the next", async () => {
    const backend = backendOn();
    for (const name of ["A", "B", "C"]) await backend.createWorkspace({ name });
    const first = await backend.listWorkspacesPage({ pageSize: 2 });
    assert.deepEqual(
      first.items.map((p) => p.name),
      ["C", "B"],
    );
    assert.ok(first.next);
    const second = await backend.listWorkspacesPage({ cursor: first.next, pageSize: 2 });
    assert.deepEqual(
      second.items.map((p) => p.name),
      ["A"],
    );
    assert.equal(second.next, null);
  });

  test("a workspace's run can't be deleted; deleting the workspace removes the run", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    await rejectsWithCode(backend.deleteRun(workspace.runId), "run_belongs_to_workspace", 409);
    assert.equal((await backend.getRun(workspace.runId)).id, workspace.runId);

    await backend.deleteWorkspace(workspace.id);
    assert.deepEqual(await backend.listWorkspaces(), []);
    await rejectsWithCode(backend.getRun(workspace.runId), "run_not_found", 404);
  });
});

describe("mock documents of a run", () => {
  test("a document that stays keeps its file, one that goes loses everything, a new one is pending", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    const first = await backend.setDocuments(workspace.runId, DOCS.slice(0, 2));
    assert.deepEqual(
      first.files.map((f) => f.sourceRef),
      DOCS.slice(0, 2).map((d) => d.id),
    );
    assert.equal(first.cells.length, 2);
    assert.ok(first.cells.every((c) => c.stage === "extract" && c.status === "pending"));

    // Records on the file that will stay.
    const stays = first.files[1];
    const dropped = first.files[0];
    await backend.addRecord(workspace.runId, stays.id, { recordTypeId: "rt-adr", span: null }, 0);

    const second = await backend.setDocuments(workspace.runId, [DOCS[1], DOCS[2]]);
    assert.equal(second.files[0].id, stays.id);
    assert.notEqual(second.files[1].id, dropped.id);
    assert.deepEqual(
      second.files.map((f) => f.sourceRef),
      [DOCS[1].id, DOCS[2].id],
    );
    assert.ok(second.cells.every((c) => second.files.some((f) => f.id === c.fileId)));
    assert.equal(second.cells.length, 2);
    assert.equal((await backend.getFileExtraction(workspace.runId, stays.id)).records.length, 1);
    await rejectsWithCode(
      backend.getFileExtraction(workspace.runId, dropped.id),
      "extraction_not_found",
      404,
    );
    assert.equal((await backend.getWorkspace(workspace.id)).documentCount, 2);
  });

  test("the configuration and the conversation stay when the documents change", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    await backend.setDocuments(workspace.runId, DOCS.slice(0, 1));
    const definition = await backend.getDefinition(workspace.runId);
    await backend.saveDefinition(workspace.runId, { ...definition, prompt: "Mine" }, 1);

    await backend.setDocuments(workspace.runId, DOCS.slice(1, 2));
    assert.equal((await backend.getDefinition(workspace.runId)).prompt, "Mine");
  });

  test("an empty list empties the run; other files than documents are refused", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    await backend.setDocuments(workspace.runId, DOCS.slice(0, 1));
    assert.deepEqual((await backend.setDocuments(workspace.runId, [])).files, []);
    await rejectsWithCode(
      backend.setDocuments(workspace.runId, [MOCK_FILES[0]]),
      "mixed_sources",
      422,
    );
    await rejectsWithCode(backend.setDocuments("nope", DOCS), "run_not_found", 404);
  });

  test("the documents can't change while an extraction is running", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    await backend.setDocuments(workspace.runId, DOCS.slice(0, 2));
    await backend.executeStage(workspace.runId, "extract");
    await rejectsWithCode(
      backend.setDocuments(workspace.runId, DOCS.slice(0, 1)),
      "execution_in_progress",
      409,
    );
    assert.equal((await backend.getRun(workspace.runId)).files.length, 2);
  });

  test("subscribers hear run.changed", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    let changed = 0;
    const handlers: RunEventHandlers = { onCell: () => {}, onRunChanged: () => changed++ };
    const stop = backend.subscribe(workspace.runId, handlers);
    await new Promise((resolve) => setTimeout(resolve, 5));

    await backend.setDocuments(workspace.runId, DOCS.slice(0, 1));
    assert.equal(changed, 1);
    stop();
    await backend.setDocuments(workspace.runId, DOCS.slice(0, 2));
    assert.equal(changed, 1);
  });
});

describe("mock configuration versions", () => {
  async function workspaceWithVersions() {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    const v1 = await backend.getDefinition(workspace.runId);
    const v2 = await backend.saveDefinition(
      workspace.runId,
      { ...v1, prompt: "Second" },
      v1.version,
      " Tightened the prompt ",
    );
    return { backend, workspace, v1, v2 };
  }

  test("a save carries a note and a time; the workspace counts the version", async () => {
    const { backend, workspace, v1, v2 } = await workspaceWithVersions();
    assert.equal(v1.note, "From template: Architecture decision records");
    assert.equal(v2.version, 2);
    assert.equal(v2.note, "Tightened the prompt");
    assert.ok(v2.createdAt >= v1.createdAt);
    assert.equal((await backend.getWorkspace(workspace.id)).configurationVersion, 2);
  });

  test("the versions are listed newest first with their counts and read one by one", async () => {
    const { backend, workspace, v1, v2 } = await workspaceWithVersions();
    const list = await backend.listDefinitionVersions(workspace.runId);
    assert.deepEqual(
      list.map((v) => [v.version, v.note]),
      [
        [2, "Tightened the prompt"],
        [1, "From template: Architecture decision records"],
      ],
    );
    assert.equal(list[0].recordTypeCount, DEFAULT_EXTRACTION_DEFINITION.recordTypes.length);
    assert.equal(
      list[0].fieldCount,
      DEFAULT_EXTRACTION_DEFINITION.recordTypes.flatMap((t) => t.fields).length,
    );
    assert.equal((await backend.getDefinitionVersion(workspace.runId, 1)).prompt, v1.prompt);
    assert.equal((await backend.getDefinitionVersion(workspace.runId, 2)).prompt, v2.prompt);
    await rejectsWithCode(
      backend.getDefinitionVersion(workspace.runId, 9),
      "definition_version_not_found",
      404,
    );
  });

  test("restoring saves a copy as the newest version and keeps the old ones", async () => {
    const { backend, workspace, v1 } = await workspaceWithVersions();
    const restored = await backend.restoreDefinitionVersion(workspace.runId, 1);
    assert.equal(restored.version, 3);
    assert.equal(restored.note, "Restored from version 1");
    assert.equal(restored.prompt, v1.prompt);
    assert.equal((await backend.getDefinition(workspace.runId)).version, 3);
    assert.equal((await backend.listDefinitionVersions(workspace.runId)).length, 3);
    assert.equal((await backend.getDefinitionVersion(workspace.runId, 2)).prompt, "Second");
    await rejectsWithCode(
      backend.restoreDefinitionVersion(workspace.runId, 7),
      "definition_version_not_found",
      404,
    );
  });

  test("a note over 200 characters is an invalid definition", async () => {
    const { backend, workspace, v2 } = await workspaceWithVersions();
    await rejectsWithCode(
      backend.saveDefinition(workspace.runId, v2, 2, "x".repeat(201)),
      "invalid_definition",
      422,
    );
    await backend.saveDefinition(workspace.runId, v2, 2, "x".repeat(200));
  });
});

describe("mock conversation", () => {
  test("clearing removes every message, keeps the definition and tells subscribers", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "P" });
    const definition = await backend.getDefinition(workspace.runId);
    let cleared = 0;
    backend.subscribe(workspace.runId, { onCell: () => {}, onAssistantCleared: () => cleared++ });
    await new Promise((resolve) => setTimeout(resolve, 5));

    await backend.sendAssistantMessage(workspace.runId, "Add a field for the owner", definition);
    await rejectsWithCode(backend.clearAssistantMessages(workspace.runId), "assistant_busy", 409);
    for (let i = 0; i < 500; i++) {
      const messages = await backend.getAssistantMessages(workspace.runId);
      if (messages.every((m) => m.status === "done")) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal((await backend.getAssistantMessages(workspace.runId)).length, 2);

    await backend.clearAssistantMessages(workspace.runId);
    assert.deepEqual(await backend.getAssistantMessages(workspace.runId), []);
    assert.equal((await backend.getDefinition(workspace.runId)).version, definition.version);
    assert.equal(cleared, 1);
  });
});

describe("mock storage of workspaces", () => {
  test("a workspace is still there when the tab's storage is cleared, and not after clearing local data", async () => {
    const tab = memoryStorage();
    const local = memoryStorage();
    const before = backendOn(tab, local);
    const workspace = await before.createWorkspace({ name: "Kept", description: "d" });
    await before.setDocuments(workspace.runId, DOCS.slice(0, 2));
    const definition = await before.getDefinition(workspace.runId);
    await before.saveDefinition(workspace.runId, definition, 1, "Saved");

    // The tab is closed: its sessionStorage is gone, localStorage is not.
    const after = backendOn(memoryStorage(), local);
    const [found] = await after.listWorkspaces();
    assert.equal(found.name, "Kept");
    assert.equal(found.documentCount, 2);
    assert.equal(found.configurationVersion, 2);
    assert.equal((await after.getRun(workspace.runId)).files.length, 2);
    assert.equal((await after.listDefinitionVersions(workspace.runId)).length, 2);

    after.reset();
    assert.equal(local.saved.size, 0);
    assert.deepEqual(await backendOn(memoryStorage(), local).listWorkspaces(), []);
  });

  test("a run that belongs to no workspace stays in the tab's storage only", async () => {
    const tab = memoryStorage();
    const local = memoryStorage();
    const backend = backendOn(tab, local);
    const run = await backend.createRun(MOCK_FILES.slice(0, 1));

    assert.equal(local.saved.size, 0);
    assert.equal((await backendOn(tab, local).getRun(run.id)).id, run.id);
    await assert.rejects(backendOn(memoryStorage(), local).getRun(run.id));
  });

  test("deleting the workspace removes it from the storage", async () => {
    const local = memoryStorage();
    const backend = backendOn(null, local);
    const workspace = await backend.createWorkspace({ name: "Gone" });
    await backend.deleteWorkspace(workspace.id);
    assert.deepEqual(await backendOn(null, local).listWorkspaces(), []);
  });
});

describe("mock templates", () => {
  test("the four templates are listed, the default first", async () => {
    const templates = await backendOn().listTemplates();
    assert.deepEqual(
      templates.map((t) => t.id),
      ["adr", "skill", "blank", "policy-rule"],
    );
    assert.deepEqual(templates, MOCK_TEMPLATES);
  });

  test("a workspace from a template gets it as version 1 with a note", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "Rules", templateId: "policy-rule" });

    assert.equal(workspace.configurationVersion, 1);
    const definition = await backend.getDefinition(workspace.runId);
    assert.equal(definition.version, 1);
    assert.equal(definition.note, "From template: Policy rules");
    assert.deepEqual(
      definition.recordTypes.map((t) => t.name),
      ["Rule"],
    );
    assert.equal(definition.output.format, "json");
    assert.equal((await backend.listDefinitionVersions(workspace.runId)).length, 1);
  });

  test("a workspace without a template starts from the ADR one", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "ADRs" });

    const definition = await backend.getDefinition(workspace.runId);
    assert.equal(definition.note, "From template: Architecture decision records");
    assert.equal(definition.recordTypes[0].name, "ADR");
  });

  test("a blank template starts with nothing set up", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "B", templateId: "blank" });
    const definition = await backend.getDefinition(workspace.runId);
    assert.deepEqual(definition.recordTypes, []);
    assert.equal(definition.prompt, "");
  });

  test("an unknown template is a 422 unknown_template and makes no workspace", async () => {
    const backend = backendOn();
    await rejectsWithCode(
      backend.createWorkspace({ name: "X", templateId: "nope" }),
      "unknown_template",
      422,
    );
    assert.deepEqual(await backend.listWorkspaces(), []);
  });

  test("changing a template's copy in a workspace leaves the templates alone", async () => {
    const backend = backendOn();
    const workspace = await backend.createWorkspace({ name: "A", templateId: "skill" });
    const v1 = await backend.getDefinition(workspace.runId);
    await backend.saveDefinition(workspace.runId, { ...v1, prompt: "Changed" }, 1, "");
    const skill = (await backend.listTemplates()).find((t) => t.id === "skill")!;
    assert.notEqual(skill.definition.prompt, "Changed");
  });
});
