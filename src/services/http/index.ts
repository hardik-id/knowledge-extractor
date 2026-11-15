import type { HttpClient } from "@/lib/api";
import { createSocketClient } from "@/lib/realtime/socket-client";
import type { SourceFile } from "@/types/pipeline";
import type { RunEvents, RunsApi, Services, SourceCatalog } from "../contracts";
import { parseCellMessage, parseExecution, parseRun, parseSourceFiles } from "./parsers";

/**
 * The service contract, served by the Django API. Paths are relative to the
 * client's base URL. If the backend names an endpoint differently, this file
 * and parsers.ts are the only places to change.
 */

const enc = encodeURIComponent;

export function createHttpSourceCatalog(client: HttpClient): SourceCatalog {
  return {
    // The first page only: the picker has no paging yet.
    list: async (source, query, signal) =>
      parseSourceFiles(
        await client.get(`sources/${enc(source)}/items`, { query: { q: query }, signal }),
      ),
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

export function createHttpRunsApi(client: HttpClient): RunsApi {
  return {
    createRun: async (files) =>
      parseRun(await client.post("runs", { body: { items: files.map(toWireItem) } })),

    getRun: async (runId, signal) => parseRun(await client.get(`runs/${enc(runId)}`, { signal })),

    executeStage: async (runId, stage, options = {}) =>
      parseExecution(
        await client.post(`runs/${enc(runId)}/stages/${enc(stage)}/executions`, {
          body: { file_ids: options.fileIds, config: options.config },
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

    deleteRun: async (runId) => {
      await client.delete(`runs/${enc(runId)}`);
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
            if (cell) handlers.onCell(cell);
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
    runs: createHttpRunsApi(options.client),
    events: createHttpRunEvents(options),
  };
}
