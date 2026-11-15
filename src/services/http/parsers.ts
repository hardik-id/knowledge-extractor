import { ApiError } from "@/lib/api/api-error";
import type { FileType, SourceFile, SourceKind } from "@/types/pipeline";
import {
  CELL_STATUSES,
  isWorkStageId,
  type Execution,
  type Run,
  type RunFile,
  type StageCell,
  type StageOutputMeta,
} from "../contracts";

/**
 * Checks what the backend sent and converts it from the wire format
 * (snake_case JSON) to the UI's types. This is the only place that knows the
 * wire format, so a change in the API is a change here.
 *
 * Wire format:
 *   file  { id, name, source, type, size_bytes, location, modified_at, source_ref? }
 *   cell  { file_id, stage, status, execution_id, progress, error: { code, message } | null,
 *           output: { name, content_type, size, etag } | null, updated_at }
 *   run   { id, created_at, files: file[], cells: cell[] }
 */

const SOURCES: readonly SourceKind[] = ["confluence", "sharepoint", "upload"];
const FILE_TYPES: readonly FileType[] = ["pdf", "docx", "xlsx", "pptx", "html", "md", "txt"];

function invalid(path: string, expected: string): never {
  throw new ApiError({
    status: 0,
    code: "invalid_response",
    message: `The server sent data the app doesn't understand (${path}: expected ${expected}).`,
  });
}

type Json = Record<string, unknown>;

function object(value: unknown, path: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(path, "an object");
  }
  return value as Json;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "a list");
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "text");
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "a number");
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== "string" || !(options as readonly string[]).includes(value)) {
    invalid(path, `one of ${options.join(", ")}`);
  }
  return value as T;
}

const nullable = <T>(value: unknown, parse: (value: unknown) => T): T | null =>
  value === null || value === undefined ? null : parse(value);

export function parseSourceFile(value: unknown, path = "file"): SourceFile {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    source: oneOf(o.source, SOURCES, `${path}.source`),
    type: oneOf(o.type, FILE_TYPES, `${path}.type`),
    sizeBytes: number(o.size_bytes, `${path}.size_bytes`),
    location: string(o.location, `${path}.location`),
    modifiedAt: string(o.modified_at, `${path}.modified_at`),
  };
}

/** `{ items: file[] }` */
export function parseSourceFiles(value: unknown): SourceFile[] {
  const items = array(object(value, "response").items, "items");
  return items.map((item, i) => parseSourceFile(item, `items[${i}]`));
}

function parseRunFile(value: unknown, path: string): RunFile {
  const file = parseSourceFile(value, path);
  const sourceRef = object(value, path).source_ref;
  return { ...file, sourceRef: typeof sourceRef === "string" ? sourceRef : file.id };
}

function parseOutput(value: unknown, path: string): StageOutputMeta {
  const o = object(value, path);
  return {
    name: string(o.name, `${path}.name`),
    contentType: string(o.content_type, `${path}.content_type`),
    sizeBytes: number(o.size, `${path}.size`),
    etag: string(o.etag, `${path}.etag`),
  };
}

/**
 * One cell. Returns null for a stage this version of the UI doesn't know, so a
 * backend that gains a stage doesn't break older clients.
 */
export function parseCell(value: unknown, path = "cell"): StageCell | null {
  const o = object(value, path);
  if (!isWorkStageId(o.stage)) return null;
  return {
    fileId: string(o.file_id, `${path}.file_id`),
    stage: o.stage,
    status: oneOf(o.status, CELL_STATUSES, `${path}.status`),
    executionId: nullable(o.execution_id, (v) => string(v, `${path}.execution_id`)),
    progress: nullable(o.progress, (v) =>
      Math.min(100, Math.max(0, number(v, `${path}.progress`))),
    ),
    error: nullable(o.error, (v) => {
      const e = object(v, `${path}.error`);
      return {
        code: string(e.code, `${path}.error.code`),
        message: string(e.message, `${path}.error.message`),
      };
    }),
    output: nullable(o.output, (v) => parseOutput(v, `${path}.output`)),
    updatedAt: string(o.updated_at, `${path}.updated_at`),
  };
}

export function parseRun(value: unknown): Run {
  const o = object(value, "run");
  return {
    id: string(o.id, "run.id"),
    createdAt: string(o.created_at, "run.created_at"),
    files: array(o.files, "run.files").map((f, i) => parseRunFile(f, `run.files[${i}]`)),
    cells: array(o.cells, "run.cells")
      .map((c, i) => parseCell(c, `run.cells[${i}]`))
      .filter((c) => c !== null),
  };
}

/** `{ execution_id, stage, file_ids }` */
export function parseExecution(value: unknown): Execution {
  const o = object(value, "execution");
  if (!isWorkStageId(o.stage)) invalid("execution.stage", "a known stage");
  return {
    id: string(o.execution_id, "execution.execution_id"),
    stage: o.stage,
    fileIds: array(o.file_ids, "execution.file_ids").map((id, i) =>
      string(id, `execution.file_ids[${i}]`),
    ),
  };
}

/** A WebSocket message: `{ type: "cell", cell }`. Other types (e.g. "pong") give null. */
export function parseCellMessage(value: unknown): StageCell | null {
  const o = object(value, "message");
  return o.type === "cell" ? parseCell(o.cell, "message.cell") : null;
}
