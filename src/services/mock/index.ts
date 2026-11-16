import { appProfile } from "@/config/app-profile";
import { isWorkStageId, type Services } from "../contracts";
import { MockBackend } from "./mock-backend";

declare global {
  interface Window {
    /** Mock mode only. Try `__mockBackend.dropConnection(8000)` `__mockBackend.failNext("transform")`, `__mockBackend.unanchorNext()` (the next extraction gets one value whose quote is not in the text) or `__mockBackend.lastExamplesUsed(runId)`. */
    __mockBackend?: MockBackend;
  }
}

/** The service contract, served by the in-browser mock. */
export function createMockServices(
  backend: MockBackend = new MockBackend({
    workStages: appProfile.stages.filter(isWorkStageId),
    storageKey: `${appProfile.storagePrefix}:mock-backend`,
  }),
): Services {
  if (typeof window !== "undefined") window.__mockBackend = backend;

  return {
    catalog: {
      list: (source, query, signal) => backend.listFiles(source, query, signal),
    },
    runs: {
      createRun: (files) => backend.createRun(files),
      getRun: (runId, signal) => backend.getRun(runId, signal),
      executeStage: (runId, stage, options) => backend.executeStage(runId, stage, options),
      getOutput: (runId, fileId, stage, signal) => backend.getOutput(runId, fileId, stage, signal),
      deleteRun: (runId) => backend.deleteRun(runId),
    },
    extraction: {
      getDefinition: (runId, signal) => backend.getDefinition(runId, signal),
      saveDefinition: (runId, draft, baseVersion) =>
        backend.saveDefinition(runId, draft, baseVersion),
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
