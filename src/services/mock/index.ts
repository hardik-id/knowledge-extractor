import type { Services } from "../contracts";
import { MockBackend } from "./mock-backend";

declare global {
  interface Window {
    /** Mock mode only. Try `__mockBackend.dropConnection(8000)` or `__mockBackend.failNext("transform")`. */
    __mockBackend?: MockBackend;
  }
}

/** The service contract, served by the in-browser mock. */
export function createMockServices(backend: MockBackend = new MockBackend()): Services {
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
    events: {
      subscribe: (runId, handlers) => backend.subscribe(runId, handlers),
    },
  };
}
