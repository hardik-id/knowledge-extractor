import { ApiError } from "@/lib/api/api-error";
import type { FileType, SourceFile, SourceKind } from "@/types/pipeline";
import {
  CELL_STATUSES,
  FIELD_MODES,
  FIELD_VALUE_TYPES,
  CHUNKING_STRATEGIES,
  OUTPUT_FORMATS,
  REVIEW_STATES,
  isWorkStageId,
  type AnnotationOrigin,
  type Execution,
  type AssistantEvent,
  type AssistantMessage,
  type AssistantProposal,
  type DefinitionTemplate,
  type DefinitionVersionSummary,
  type ExtractionChange,
  type BackendStatus,
  type Project,
  type ProjectPage,
  type ProjectPatch,
  type PublishResult,
  type ExtractionDefinition,
  type ExtractionDefinitionDraft,
  type ExtractionRecord,
  type FieldDef,
  type FieldValue,
  type FieldValueInput,
  type FileExtraction,
  type NewRecordInput,
  type RecordPatch,
  type RecordType,
  type ReviewState,
  type TextSpan,
  type Run,
  type RunFile,
  type StageCell,
  type ChunkingSettings,
  type StageOutputMeta,
} from "../contracts";

/**
 * Checks what the backend sent and converts it from the wire format
 * (snake_case JSON) to the UI's types. This is the only place that knows the
 * wire format, so a change in the API is a change here.
 *
 * Wire format:
 *   file  { id, name, source, type, size_bytes, location, modified_at, source_ref?, etag? }
 *   cell  { file_id, stage, status, execution_id, progress, error: { code, message } | null,
 *           output: { name, content_type, size, etag } | null, updated_at }
 *   run   { id, created_at, files: file[], cells: cell[] }
 *   execution request  { file_ids?, config?: { definition_version, … } }   (config keys in snake_case)
 *   span  { start, end, quote }   (start and end count Unicode code points)
 *   definition  { version, prompt, output: { format, template }, chunking: { strategy, size } (absent: auto),
 *                 record_types: [{ id, name, description,
 *                   fields: [{ id, key, name, description, mode, value_type, choices?, multiple }] }] }
 *   file extraction  { file_id, revision, source_etag, definition_version,
 *                      records: [{ id, file_id, record_type_id, span: span | null, origin, review,
 *                        use_as_example, fields: [{ id, field_id, value, spans: span[], origin,
 *                        review, anchored }] }] }
 *   assistant message  { id, role, text, proposal: { definition (no version), reasons: [{ path, reason }] } | null,
 *                        status, created_at }
 *   publish result  { pipeline_config_version, examples }
 *   message  { type: "cell", cell } | { type: "extraction.changed", file_id, revision }
 *          | { type: "assistant.delta", message_id, text }
 *          | { type: "assistant.proposal", message_id, proposal }
 *          | { type: "assistant.done", message_id }
 */

const ROLES = ["user", "assistant"] as const;
const MESSAGE_STATUSES = ["streaming", "done"] as const;
const SOURCES: readonly SourceKind[] = ["confluence", "sharepoint", "upload", "storage"];
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
    // Only storage documents report a version.
    ...(o.etag === undefined || o.etag === null ? {} : { etag: string(o.etag, `${path}.etag`) }),
  };
}

/** The value of an `ETag` header without its quotes or a weak (`W/`) prefix. */
export function parseEtagHeader(header: string | null): string {
  const etag = header
    ?.trim()
    .replace(/^W\//, "")
    .replace(/^"(.*)"$/, "$1");
  if (!etag) {
    throw new ApiError({
      status: 0,
      code: "invalid_response",
      message: "The server sent a document without an ETag.",
    });
  }
  return etag;
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

const toSnakeCase = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * An execution's `config` as the API takes it: its keys in snake_case, so
 * `{ definitionVersion: 3 }` goes out as `{ definition_version: 3 }`.
 * Only the top-level keys are renamed; values are sent as they are.
 */
export function toWireExecutionConfig(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!config) return undefined;
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [toSnakeCase(k), v]));
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

// ── Extraction ──────────────────────────────────────────────────────────

const ORIGINS: readonly AnnotationOrigin[] = ["llm", "human"];

function parseFieldDef(value: unknown, path: string): FieldDef {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    key: string(o.key, `${path}.key`),
    name: string(o.name, `${path}.name`),
    description: string(o.description, `${path}.description`),
    mode: oneOf(o.mode, FIELD_MODES, `${path}.mode`),
    valueType: oneOf(o.value_type, FIELD_VALUE_TYPES, `${path}.value_type`),
    choices:
      o.choices === undefined || o.choices === null
        ? []
        : array(o.choices, `${path}.choices`).map((c, i) => string(c, `${path}.choices[${i}]`)),
    multiple: bool(o.multiple, `${path}.multiple`),
  };
}

function parseRecordType(value: unknown, path: string): RecordType {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    description: string(o.description, `${path}.description`),
    fields: array(o.fields, `${path}.fields`).map((f, i) =>
      parseFieldDef(f, `${path}.fields[${i}]`),
    ),
  };
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "true or false");
  return value;
}

function parseChunking(value: unknown, path: string): ChunkingSettings {
  // A version saved before chunking existed: automatic.
  if (value === undefined || value === null) return { strategy: "auto", size: null };
  const o = object(value, path);
  const strategy = oneOf(o.strategy, CHUNKING_STRATEGIES, `${path}.strategy`);
  if (strategy === "auto") return { strategy, size: null };
  const size = o.size;
  if (size === null || size === undefined) return { strategy, size: null };
  return { strategy, size: number(size, `${path}.size`) };
}

function parseDefinitionBody(value: unknown, path: string): ExtractionDefinitionDraft {
  const o = object(value, path);
  const output = object(o.output, `${path}.output`);
  return {
    prompt: string(o.prompt, `${path}.prompt`),
    recordTypes: array(o.record_types, `${path}.record_types`).map((t, i) =>
      parseRecordType(t, `${path}.record_types[${i}]`),
    ),
    output: {
      format: oneOf(output.format, OUTPUT_FORMATS, `${path}.output.format`),
      template: string(output.template, `${path}.output.template`),
    },
    chunking: parseChunking(o.chunking, `${path}.chunking`),
  };
}

export function parseDefinition(value: unknown): ExtractionDefinition {
  const o = object(value, "definition");
  return {
    version: number(o.version, "definition.version"),
    ...parseDefinitionBody(value, "definition"),
    note: string(o.note, "definition.note"),
    createdAt: string(o.created_at, "definition.created_at"),
  };
}

/** `{ items: [{ version, note, created_at, record_type_count, field_count }] }` */
export function parseDefinitionVersions(value: unknown): DefinitionVersionSummary[] {
  return array(object(value, "versions").items, "versions.items").map((item, i) => {
    const path = `versions.items[${i}]`;
    const o = object(item, path);
    return {
      version: number(o.version, `${path}.version`),
      note: string(o.note, `${path}.note`),
      createdAt: string(o.created_at, `${path}.created_at`),
      recordTypeCount: number(o.record_type_count, `${path}.record_type_count`),
      fieldCount: number(o.field_count, `${path}.field_count`),
    };
  });
}

// ── Templates ───────────────────────────────────────────────────────────

/** `{ items: [{ id, name, description, definition }], next }` */
export function parseTemplates(value: unknown): DefinitionTemplate[] {
  return array(object(value, "templates").items, "templates.items").map((item, i) => {
    const path = `templates.items[${i}]`;
    const o = object(item, path);
    return {
      id: string(o.id, `${path}.id`),
      name: string(o.name, `${path}.name`),
      description: string(o.description, `${path}.description`),
      definition: parseDefinitionBody(o.definition, `${path}.definition`),
    };
  });
}

// ── Backend status ──────────────────────────────────────────────────────

const STATUS_MODES = ["stub", "real"] as const;
const STATUS_STATES = ["stub", "ok", "failing", "unknown"] as const;

/**
 * `{ environment, parts: [{ id, mode, label, state, checked_at, problem }] }`. A part whose id
 * is new to this UI is kept. A mode or state this UI does not know is read as "real" and
 * "unknown" so one new word never hides the whole panel.
 */
export function parseBackendStatus(value: unknown): BackendStatus {
  const o = object(value, "status");
  return {
    environment: typeof o.environment === "string" ? o.environment : "",
    parts: array(o.parts, "status.parts").map((item, i) => {
      const path = `status.parts[${i}]`;
      const p = object(item, path);
      return {
        id: string(p.id, `${path}.id`),
        mode: STATUS_MODES.find((m) => m === p.mode) ?? "real",
        label: string(p.label, `${path}.label`),
        state: STATUS_STATES.find((s) => s === p.state) ?? "unknown",
        checkedAt: nullable(p.checked_at, (v) => string(v, `${path}.checked_at`)),
        problem: nullable(p.problem, (v) => string(v, `${path}.problem`)),
      };
    }),
  };
}

// ── Projects ────────────────────────────────────────────────────────────

export function parseProject(value: unknown, path = "project"): Project {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    name: string(o.name, `${path}.name`),
    description: string(o.description, `${path}.description`),
    runId: string(o.run_id, `${path}.run_id`),
    documentCount: number(o.document_count, `${path}.document_count`),
    configurationVersion: nullable(o.configuration_version, (v) =>
      number(v, `${path}.configuration_version`),
    ),
    createdAt: string(o.created_at, `${path}.created_at`),
    updatedAt: string(o.updated_at, `${path}.updated_at`),
  };
}

/** `{ items: [project], next }` */
export function parseProjects(value: unknown): Project[] {
  return array(object(value, "projects").items, "projects.items").map((p, i) =>
    parseProject(p, `projects.items[${i}]`),
  );
}

/** `{ items: [project], next }` with the cursor kept. */
export function parseProjectPage(value: unknown): ProjectPage {
  const page = object(value, "projects");
  const next = page.next;
  if (next !== null && next !== undefined && typeof next !== "string") {
    invalid("projects.next", "text or null");
  }
  return { items: parseProjects(value), next: next ?? null };
}

export function toWireProjectPatch(patch: ProjectPatch) {
  return { name: patch.name, description: patch.description };
}

/** The definition as the API takes it (without `version`). */
export function toWireDefinition(draft: ExtractionDefinitionDraft) {
  return {
    prompt: draft.prompt,
    record_types: draft.recordTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      fields: t.fields.map((f) => ({
        id: f.id,
        key: f.key,
        name: f.name,
        description: f.description,
        mode: f.mode,
        value_type: f.valueType,
        choices: f.choices,
        multiple: f.multiple,
      })),
    })),
    output: { format: draft.output.format, template: draft.output.template },
    chunking: { strategy: draft.chunking.strategy, size: draft.chunking.size },
  };
}

function parseSpan(value: unknown, path: string): TextSpan {
  const o = object(value, path);
  return {
    start: number(o.start, `${path}.start`),
    end: number(o.end, `${path}.end`),
    quote: string(o.quote, `${path}.quote`),
  };
}

function parseFieldValue(value: unknown, path: string): FieldValue {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    fieldId: string(o.field_id, `${path}.field_id`),
    value: nullable(o.value, (v) => string(v, `${path}.value`)),
    spans: array(o.spans, `${path}.spans`).map((s, i) => parseSpan(s, `${path}.spans[${i}]`)),
    origin: oneOf(o.origin, ORIGINS, `${path}.origin`),
    review: oneOf(o.review, REVIEW_STATES, `${path}.review`),
    anchored: bool(o.anchored, `${path}.anchored`),
  };
}

function parseRecord(value: unknown, path: string): ExtractionRecord {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    fileId: string(o.file_id, `${path}.file_id`),
    recordTypeId: string(o.record_type_id, `${path}.record_type_id`),
    span: nullable(o.span, (v) => parseSpan(v, `${path}.span`)),
    fields: array(o.fields, `${path}.fields`).map((f, i) =>
      parseFieldValue(f, `${path}.fields[${i}]`),
    ),
    origin: oneOf(o.origin, ORIGINS, `${path}.origin`),
    review: oneOf(o.review, REVIEW_STATES, `${path}.review`),
    useAsExample: bool(o.use_as_example, `${path}.use_as_example`),
  };
}

export function parseFileExtraction(value: unknown): FileExtraction {
  const o = object(value, "extraction");
  return {
    fileId: string(o.file_id, "extraction.file_id"),
    revision: number(o.revision, "extraction.revision"),
    sourceEtag: string(o.source_etag, "extraction.source_etag"),
    definitionVersion: number(o.definition_version, "extraction.definition_version"),
    records: array(o.records, "extraction.records").map((r, i) =>
      parseRecord(r, `extraction.records[${i}]`),
    ),
  };
}

/** A WebSocket message: `{ type: "run.changed" }`. */
export function isRunChangedMessage(value: unknown): boolean {
  return object(value, "message").type === "run.changed";
}

/** A WebSocket message: `{ type: "assistant.cleared" }`. */
export function isAssistantClearedMessage(value: unknown): boolean {
  return object(value, "message").type === "assistant.cleared";
}

/** A WebSocket message: `{ type: "extraction.changed", file_id, revision }`. Other types give null. */
export function parseExtractionChangedMessage(value: unknown): ExtractionChange | null {
  const o = object(value, "message");
  if (o.type !== "extraction.changed") return null;
  return {
    fileId: string(o.file_id, "message.file_id"),
    revision: number(o.revision, "message.revision"),
  };
}

const toWireSpan = (span: TextSpan) => ({ start: span.start, end: span.end, quote: span.quote });

const toWireValues = (values: FieldValueInput[]) =>
  values.map((v) => ({ value: v.value, spans: v.spans.map(toWireSpan) }));

/** Body of `POST …/extraction/records`. */
export function toWireNewRecord(input: NewRecordInput, revision: number) {
  return {
    revision,
    record_type_id: input.recordTypeId,
    span: input.span ? toWireSpan(input.span) : null,
    fields: (input.fields ?? []).map((f) => ({
      field_id: f.fieldId,
      values: toWireValues(f.values),
    })),
  };
}

/** Body of `PATCH …/records/{id}`: only the keys present in the patch. `span: null` is sent. */
export function toWireRecordPatch(patch: RecordPatch, revision: number) {
  const body: {
    revision: number;
    review?: ReviewState;
    span?: ReturnType<typeof toWireSpan> | null;
    use_as_example?: boolean;
  } = { revision };
  if (patch.review !== undefined) body.review = patch.review;
  if (patch.span !== undefined) body.span = patch.span ? toWireSpan(patch.span) : null;
  if (patch.useAsExample !== undefined) body.use_as_example = patch.useAsExample;
  return body;
}

/** Body of `PUT …/fields/{id}`. An empty list resets the field to "not found". */
export function toWireFieldValues(values: FieldValueInput[], revision: number) {
  return { revision, values: toWireValues(values) };
}

/** Body of `PATCH …/values/{id}`. */
export function toWireValueReview(review: ReviewState, revision: number) {
  return { revision, review };
}

// ── Assistant and publishing ────────────────────────────────────────────

function parseProposal(value: unknown, path: string): AssistantProposal {
  const o = object(value, path);
  return {
    definition: parseDefinitionBody(o.definition, `${path}.definition`),
    reasons:
      o.reasons === undefined || o.reasons === null
        ? []
        : array(o.reasons, `${path}.reasons`).map((r, i) => {
            const reason = object(r, `${path}.reasons[${i}]`);
            return {
              path: string(reason.path, `${path}.reasons[${i}].path`),
              reason: string(reason.reason, `${path}.reasons[${i}].reason`),
            };
          }),
  };
}

export function parseAssistantMessage(value: unknown, path = "message"): AssistantMessage {
  const o = object(value, path);
  return {
    id: string(o.id, `${path}.id`),
    role: oneOf(o.role, ROLES, `${path}.role`),
    text: string(o.text, `${path}.text`),
    proposal: nullable(o.proposal, (v) => parseProposal(v, `${path}.proposal`)),
    status: oneOf(o.status, MESSAGE_STATUSES, `${path}.status`),
    createdAt: string(o.created_at, `${path}.created_at`),
  };
}

/** `{ messages: message[] }` */
export function parseAssistantMessages(value: unknown): AssistantMessage[] {
  return array(object(value, "response").messages, "messages").map((m, i) =>
    parseAssistantMessage(m, `messages[${i}]`),
  );
}

/** A WebSocket message of type `assistant.delta`, `assistant.proposal` or `assistant.done`. Other types give null. */
export function parseAssistantEventMessage(value: unknown): AssistantEvent | null {
  const o = object(value, "message");
  switch (o.type) {
    case "assistant.delta":
      return {
        type: "delta",
        messageId: string(o.message_id, "message.message_id"),
        text: string(o.text, "message.text"),
      };
    case "assistant.proposal":
      return {
        type: "proposal",
        messageId: string(o.message_id, "message.message_id"),
        proposal: parseProposal(o.proposal, "message.proposal"),
      };
    case "assistant.done":
      return { type: "done", messageId: string(o.message_id, "message.message_id") };
    default:
      return null;
  }
}

/** `{ pipeline_config_version, examples }` */
export function parsePublishResult(value: unknown): PublishResult {
  const o = object(value, "publish");
  return {
    pipelineConfigVersion: number(o.pipeline_config_version, "publish.pipeline_config_version"),
    examples: number(o.examples, "publish.examples"),
  };
}
