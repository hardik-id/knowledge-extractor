import type { HttpClient } from "@/lib/api";
import { createSocketClient } from "@/lib/realtime/socket-client";
import type { SourceFile } from "@/types/pipeline";
import type {
  DocumentsApi,
  ExtractionApi,
  ProjectsApi,
  RunEvents,
  RunsApi,
  Services,
  SourceCatalog,
} from "../contracts";
import {
  parseAssistantEventMessage,
  parseAssistantMessage,
  parseAssistantMessages,
  parseCellMessage,
  parseDefinition,
  isAssistantClearedMessage,
  isRunChangedMessage,
  parseDefinitionVersions,
  parseExecution,
  parseProject,
  parseProjectPage,
  parseProjects,
  parseEtagHeader,
  parseExtractionChangedMessage,
  parseFileExtraction,
  parsePublishResult,
  parseRun,
  parseSourceFiles,
  toWireDefinition,
  toWireExecutionConfig,
  toWireFieldValues,
  toWireNewRecord,
  toWireProjectPatch,
  toWireRecordPatch,
  toWireValueReview,
} from "./parsers";

/**
 * The service contract, served by the Django API. Paths are relative to the
 * client's base URL. If the backend names an endpoint differently, this file
 * and parsers.ts are the only places to change.
 */

const enc = encodeURIComponent;

export function createHttpSourceCatalog(client: HttpClient): SourceCatalog {
  return {
    // The first page only: the picker has no paging yet.
    // Storage documents have their own endpoint: they are read with the person's own access.
    list: async (source, query, signal) =>
      parseSourceFiles(
        await client.get(source === "storage" ? "documents" : `sources/${enc(source)}/items`, {
          query: { q: query },
          signal,
        }),
      ),
  };
}

export function createHttpDocumentsApi(client: HttpClient): DocumentsApi {
  return {
    get: async (documentId, signal) => {
      const response = await client.request("GET", `documents/${enc(documentId)}`, {
        signal,
        headers: { Accept: "text/markdown, text/plain" },
      });
      return {
        text: await response.text(),
        contentType: response.headers.get("Content-Type") ?? "text/markdown",
        etag: parseEtagHeader(response.headers.get("ETag")),
      };
    },
  };
}

const toWireItem = (file: SourceFile) => ({
  source: file.source,
  source_ref: file.id,
  name: file.name,
  type: file.type,
  size_bytes: file.sizeBytes,
  location: file.location,
  modified_at: file.modifiedAt,
});

export function createHttpProjectsApi(client: HttpClient): ProjectsApi {
  return {
    list: async (signal) => parseProjects(await client.get("projects", { signal })),

    listPage: async ({ cursor, signal } = {}) =>
      parseProjectPage(await client.get("projects", { signal, query: { cursor } })),

    create: async (input) =>
      parseProject(
        await client.post("projects", {
          body: { name: input.name, description: input.description },
        }),
      ),

    get: async (projectId, signal) =>
      parseProject(await client.get(`projects/${enc(projectId)}`, { signal })),

    rename: async (projectId, patch) => {
      const response = await client.request("PATCH", `projects/${enc(projectId)}`, {
        body: toWireProjectPatch(patch),
      });
      return parseProject(await response.json().catch(() => undefined));
    },

    remove: async (projectId) => {
      await client.delete(`projects/${enc(projectId)}`);
    },
  };
}

export function createHttpRunsApi(client: HttpClient): RunsApi {
  return {
    createRun: async (files) =>
      parseRun(await client.post("runs", { body: { items: files.map(toWireItem) } })),

    getRun: async (runId, signal) => parseRun(await client.get(`runs/${enc(runId)}`, { signal })),

    executeStage: async (runId, stage, options = {}) =>
      parseExecution(
        await client.post(`runs/${enc(runId)}/stages/${enc(stage)}/executions`, {
          body: { file_ids: options.fileIds, config: toWireExecutionConfig(options.config) },
        }),
      ),

    getOutput: async (runId, fileId, stage, signal) => {
      const response = await client.request(
        "GET",
        `runs/${enc(runId)}/files/${enc(fileId)}/outputs/${enc(stage)}`,
        { signal, headers: { Accept: "text/markdown, application/json, text/plain" } },
      );
      return {
        text: await response.text(),
        contentType: response.headers.get("Content-Type") ?? "text/plain",
      };
    },

    setDocuments: async (runId, files) => {
      const response = await client.request("PUT", `runs/${enc(runId)}/documents`, {
        body: { items: files.map(toWireItem) },
      });
      return parseRun(await response.json().catch(() => undefined));
    },

    deleteRun: async (runId) => {
      await client.delete(`runs/${enc(runId)}`);
    },
  };
}

export function createHttpExtractionApi(client: HttpClient): ExtractionApi {
  const definitionPath = (runId: string) => `runs/${enc(runId)}/stages/extract/definition`;
  const assistantPath = (runId: string) => `runs/${enc(runId)}/extraction/assistant/messages`;
  const extractionPath = (runId: string, fileId: string, rest: string) =>
    `runs/${enc(runId)}/files/${enc(fileId)}/extraction/${rest}`;
  /** A change to the records. The response is the file's new state. */
  const write = async (
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    query?: Record<string, number>,
  ) =>
    parseFileExtraction(
      await (await client.request(method, path, { body, query })).json().catch(() => undefined),
    );
  return {
    getDefinition: async (runId, signal) =>
      parseDefinition(await client.get(definitionPath(runId), { signal })),

    saveDefinition: async (runId, draft, baseVersion, note) => {
      const response = await client.request("PUT", definitionPath(runId), {
        body: { base_version: baseVersion, note, ...toWireDefinition(draft) },
      });
      return parseDefinition(await response.json().catch(() => undefined));
    },

    listDefinitionVersions: async (runId, signal) =>
      parseDefinitionVersions(await client.get(`${definitionPath(runId)}/versions`, { signal })),

    getDefinitionVersion: async (runId, version, signal) =>
      parseDefinition(
        await client.get(`${definitionPath(runId)}/versions/${enc(String(version))}`, { signal }),
      ),

    restoreDefinitionVersion: async (runId, version) => {
      const response = await client.request(
        "POST",
        `${definitionPath(runId)}/versions/${enc(String(version))}/restore`,
      );
      return parseDefinition(await response.json().catch(() => undefined));
    },

    getFileExtraction: async (runId, fileId, signal) =>
      parseFileExtraction(
        await client.get(`runs/${enc(runId)}/files/${enc(fileId)}/extraction`, { signal }),
      ),

    addRecord: (runId, fileId, input, revision) =>
      write("POST", extractionPath(runId, fileId, "records"), toWireNewRecord(input, revision)),

    updateRecord: (runId, fileId, recordId, patch, revision) =>
      write(
        "PATCH",
        extractionPath(runId, fileId, `records/${enc(recordId)}`),
        toWireRecordPatch(patch, revision),
      ),

    deleteRecord: (runId, fileId, recordId, revision) =>
      write("DELETE", extractionPath(runId, fileId, `records/${enc(recordId)}`), undefined, {
        revision,
      }),

    setFieldValues: (runId, fileId, recordId, fieldId, values, revision) =>
      write(
        "PUT",
        extractionPath(runId, fileId, `records/${enc(recordId)}/fields/${enc(fieldId)}`),
        toWireFieldValues(values, revision),
      ),

    setValueReview: (runId, fileId, recordId, valueId, review, revision) =>
      write(
        "PATCH",
        extractionPath(runId, fileId, `records/${enc(recordId)}/values/${enc(valueId)}`),
        toWireValueReview(review, revision),
      ),

    getAssistantMessages: async (runId, signal) =>
      parseAssistantMessages(await client.get(assistantPath(runId), { signal })),

    sendAssistantMessage: async (runId, text, definition) => {
      const response = await client.request("POST", assistantPath(runId), {
        body: { text, definition: toWireDefinition(definition) },
      });
      return parseAssistantMessage(await response.json().catch(() => undefined));
    },

    clearAssistantMessages: async (runId) => {
      await client.delete(assistantPath(runId));
    },

    publishDefinition: async (runId) => {
      const response = await client.request("POST", `${definitionPath(runId)}/publish`);
      return parsePublishResult(await response.json().catch(() => undefined));
    },
  };
}

export interface HttpRunEventsOptions {
  client: HttpClient;
  wsBaseUrl: string;
  WebSocketImpl?: typeof WebSocket;
}

export function createHttpRunEvents({
  client,
  wsBaseUrl,
  WebSocketImpl,
}: HttpRunEventsOptions): RunEvents {
  /**
   * A browser can't send an Authorization header on a WebSocket, so the API
   * hands out a short-lived, single-use ticket that goes in the URL instead.
   */
  const ticket = async (): Promise<string> => {
    const body = await client.post("ws-ticket");
    const value = (body as { ticket?: unknown } | undefined)?.ticket;
    if (typeof value !== "string") throw new Error("The server did not return a socket ticket.");
    return value;
  };

  return {
    subscribe(runId, handlers) {
      const socket = createSocketClient({
        WebSocketImpl,
        url: async () => `${wsBaseUrl}/ws/runs/${enc(runId)}/?ticket=${enc(await ticket())}`,
        onStateChange: handlers.onStateChange,
        onOpen: () => handlers.onOpen?.(),
        onMessage: (data) => {
          try {
            const cell = parseCellMessage(data);
            if (cell) {
              handlers.onCell(cell);
              return;
            }
            const change = parseExtractionChangedMessage(data);
            if (change) {
              handlers.onExtractionChanged?.(change);
              return;
            }
            if (isRunChangedMessage(data)) {
              handlers.onRunChanged?.();
              return;
            }
            if (isAssistantClearedMessage(data)) {
              handlers.onAssistantCleared?.();
              return;
            }
            const assistant = parseAssistantEventMessage(data);
            if (assistant) handlers.onAssistantEvent?.(assistant);
          } catch (error) {
            // One bad message must not take the stream down. The next snapshot corrects the state.
            console.warn("Ignored a live update the app couldn't read.", error);
          }
        },
      });
      socket.connect();
      return () => socket.close();
    },
  };
}

export function createHttpServices(options: HttpRunEventsOptions): Services {
  return {
    catalog: createHttpSourceCatalog(options.client),
    documents: createHttpDocumentsApi(options.client),
    projects: createHttpProjectsApi(options.client),
    runs: createHttpRunsApi(options.client),
    extraction: createHttpExtractionApi(options.client),
    events: createHttpRunEvents(options),
  };
}
