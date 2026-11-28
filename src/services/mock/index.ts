import type { BackendStatus, Services } from "../contracts";
import { MockAccess } from "./mock-access";
import { MOCK_PERSON } from "./mock-person";
import { MockBackend } from "./mock-backend";

declare global {
  interface Window {
    /** Mock mode only. Try `__mockBackend.dropConnection(8000)` `__mockBackend.failNext("transform")`, `__mockBackend.failNextChunkingGeneration()` (the next custom chunking Generate fails), `__mockBackend.unanchorNext()` (the next extraction gets one value whose quote is not in the text) or `__mockBackend.lastExamplesUsed(runId)`. */
    __mockBackend?: MockBackend;
  }
}

const MOCK_STATUS: BackendStatus = {
  environment: "mock",
  parts: [
    {
      id: "data",
      mode: "stub",
      label: "Built-in mock, no API",
      state: "stub",
      checkedAt: null,
      problem: null,
    },
  ],
};

/** The service contract, served by the in-browser mock. */
export function createMockServices(backend: MockBackend = new MockBackend()): Services {
  if (typeof window !== "undefined") window.__mockBackend = backend;

  const access = new MockAccess({
    workspaces: { list: () => backend.listWorkspaces(), get: (id) => backend.getWorkspace(id) },
  });

  return {
    access: access.api,
    me: async () => structuredClone(MOCK_PERSON),
    status: {
      // The mock has no API behind it: one stand-in part, and nothing to test.
      get: async () => MOCK_STATUS,
      test: async () => ({ status: MOCK_STATUS, cached: false }),
    },
    catalog: {
      list: (source, query, signal) => backend.listFiles(source, query, signal),
    },
    documents: {
      get: (id, signal) => backend.getDocument(id, signal),
    },
    workspaces: {
      list: (signal) => backend.listWorkspaces(signal),
      listPage: (options) => backend.listWorkspacesPage(options),
      create: (input) => backend.createWorkspace(input),
      get: (workspaceId, signal) => backend.getWorkspace(workspaceId, signal),
      rename: (workspaceId, patch) => backend.updateWorkspace(workspaceId, patch),
      remove: (workspaceId) => backend.deleteWorkspace(workspaceId),
    },
    templates: {
      list: (signal) => backend.listTemplates(signal),
    },
    runs: {
      setDocuments: (runId, files) => backend.setDocuments(runId, files),
      createRun: (files) => backend.createRun(files),
      getRun: (runId, signal) => backend.getRun(runId, signal),
      executeStage: (runId, stage, options) => backend.executeStage(runId, stage, options),
      getOutput: (runId, fileId, stage, signal) => backend.getOutput(runId, fileId, stage, signal),
      deleteRun: (runId) => backend.deleteRun(runId),
    },
    extraction: {
      getDefinition: (runId, signal) => backend.getDefinition(runId, signal),
      saveDefinition: (runId, draft, baseVersion, note) =>
        backend.saveDefinition(runId, draft, baseVersion, note),
      generateCustomChunking: (runId, request, signal) =>
        backend.generateCustomChunking(runId, request, signal),
      listDefinitionVersions: (runId, signal) => backend.listDefinitionVersions(runId, signal),
      getDefinitionVersion: (runId, version, signal) =>
        backend.getDefinitionVersion(runId, version, signal),
      restoreDefinitionVersion: (runId, version) =>
        backend.restoreDefinitionVersion(runId, version),
      clearAssistantMessages: (runId) => backend.clearAssistantMessages(runId),
      getFileExtraction: (runId, fileId, signal) =>
        backend.getFileExtraction(runId, fileId, signal),
      addRecord: (runId, fileId, input, revision) =>
        backend.addRecord(runId, fileId, input, revision),
      updateRecord: (runId, fileId, recordId, patch, revision) =>
        backend.updateRecord(runId, fileId, recordId, patch, revision),
      deleteRecord: (runId, fileId, recordId, revision) =>
        backend.deleteRecord(runId, fileId, recordId, revision),
      setFieldValues: (runId, fileId, recordId, fieldId, values, revision) =>
        backend.setFieldValues(runId, fileId, recordId, fieldId, values, revision),
      setValueReview: (runId, fileId, recordId, valueId, review, revision) =>
        backend.setValueReview(runId, fileId, recordId, valueId, review, revision),
      getAssistantMessages: (runId, signal) => backend.getAssistantMessages(runId, signal),
      sendAssistantMessage: (runId, text, definition) =>
        backend.sendAssistantMessage(runId, text, definition),
      publishDefinition: (runId) => backend.publishDefinition(runId),
    },
    events: {
      subscribe: (runId, handlers) => backend.subscribe(runId, handlers),
    },
  };
}
