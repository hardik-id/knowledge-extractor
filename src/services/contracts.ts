import { STAGE_IDS, type SourceFile, type SourceKind, type StageId } from "@/types/pipeline";

/**
 * The contract between the UI and the backend. The store and components
 * depend only on these types; `services/http` and `services/mock` implement them.
 *
 * Model: a run is a set of files. For every file and every stage there is one
 * cell that says how far that work is. Commands go out over REST, the full
 * state comes back as a snapshot, and changes arrive as single cells.
 */

/** Stages that do work on files (everything after file selection). */
export type WorkStageId = Exclude<StageId, "select">;

export const WORK_STAGE_IDS = STAGE_IDS.filter(
  (id): id is WorkStageId => id !== "select",
) as readonly WorkStageId[];

export function isWorkStageId(value: unknown): value is WorkStageId {
  return typeof value === "string" && (WORK_STAGE_IDS as readonly string[]).includes(value);
}

/** Stages whose output is the document as Markdown. */
export const MARKDOWN_STAGE_IDS = ["transform", "classify", "enrich"] as const;

export type MarkdownStageId = (typeof MARKDOWN_STAGE_IDS)[number];

/**
 * Classification writes a copy of the Markdown file (with front matter) to its
 * own container, and enrichment updates that copy in place. So the two stages
 * have one stored file between them: a write by either changes what both return.
 */
const SHARED_OUTPUT_STAGES: readonly WorkStageId[] = ["classify", "enrich"];

/** The stages that write the stored file `stage` outputs, itself included. */
export function sharedOutputStages(stage: WorkStageId): readonly WorkStageId[] {
  return SHARED_OUTPUT_STAGES.includes(stage) ? SHARED_OUTPUT_STAGES : [stage];
}

/**
 * - pending:   never run
 * - queued:    accepted, waiting for a worker
 * - running:   a worker is on it
 * - succeeded: finished, output available
 * - failed:    finished with an error
 * - stale:     finished, but an earlier stage was run again since
 */
export const CELL_STATUSES = [
  "pending",
  "queued",
  "running",
  "succeeded",
  "failed",
  "stale",
] as const;

export type CellStatus = (typeof CELL_STATUSES)[number];

export interface StageOutputMeta {
  /** File name of the output, e.g. "leave-policy-2026.md" */
  name: string;
  contentType: string;
  sizeBytes: number;
  /** Changes whenever the output changes: use it as a cache key. */
  etag: string;
}

export interface CellError {
  code: string;
  message: string;
}

/** The state of one stage for one file. */
export interface StageCell {
  fileId: string;
  stage: WorkStageId;
  status: CellStatus;
  /** The execution (one click on run) that produced this state. */
  executionId: string | null;
  /** 0–100, or null when the backend doesn't report progress. */
  progress: number | null;
  error: CellError | null;
  output: StageOutputMeta | null;
  updatedAt: string; // ISO-8601
}

/** A file inside a run. `id` is the backend's id for it, used in every later call. */
export interface RunFile extends SourceFile {
  /** The id the file had in the source catalog when it was selected. */
  sourceRef: string;
}

export interface Run {
  id: string;
  createdAt: string; // ISO-8601
  files: RunFile[];
  cells: StageCell[];
}

export interface ExecuteStageOptions {
  /** Limit the execution to these files. Default: every file in the run. */
  fileIds?: string[];
  /** Stage settings for this execution. */
  config?: Record<string, unknown>;
}

export interface Execution {
  id: string;
  stage: WorkStageId;
  fileIds: string[];
}

export interface StageOutputContent {
  text: string;
  contentType: string;
}

export interface SourceCatalog {
  list(source: SourceKind, query: string, signal?: AbortSignal): Promise<SourceFile[]>;
}

/**
 * Every method rejects with an ApiError (see lib/api). Codes the UI handles:
 * `run_not_found` (404), `execution_in_progress` (409), `upstream_not_ready` (422).
 */
export interface RunsApi {
  createRun(files: SourceFile[]): Promise<Run>;
  getRun(runId: string, signal?: AbortSignal): Promise<Run>;
  /** Starts the work and returns at once. Progress arrives as cells. */
  executeStage(
    runId: string,
    stage: WorkStageId,
    options?: ExecuteStageOptions,
  ): Promise<Execution>;
  /** The text of one output (Markdown, JSON). */
  getOutput(
    runId: string,
    fileId: string,
    stage: WorkStageId,
    signal?: AbortSignal,
  ): Promise<StageOutputContent>;
  /**
   * Replaces the documents of a run. A document that is in both lists keeps
   * its run file (same id, its cell, its records); one left out is dropped
   * with everything on it; a new one starts pending. The configuration and
   * the conversation are kept. Resolves with the run as it is now.
   * Rejects with `mixed_sources` (422), and with `execution_in_progress` (409)
   * while a file of the run is queued or running.
   */
  setDocuments(runId: string, files: SourceFile[]): Promise<Run>;
  /** Rejects with `run_belongs_to_project` (409) for the run of a project: delete the project instead. */
  deleteRun(runId: string): Promise<void>;
}

// ── Projects ────────────────────────────────────────────────────────────

/** A name on a run: the run with its documents, configuration, conversation and records. */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** The project's run. It exists from the start, empty. Everything inside goes through the run's own calls. */
  runId: string;
  documentCount: number;
  /** The latest saved version of the run's extraction configuration, or null before the first. */
  configurationVersion: number | null;
  createdAt: string; // ISO-8601
  /** The last activity in the project, not only a rename. */
  updatedAt: string; // ISO-8601
}

export interface ProjectPage {
  items: Project[];
  /** An opaque cursor for the next page, or null on the last one. */
  next: string | null;
}

export interface NewProjectInput {
  /** Required, not blank, at most 120 characters. */
  name: string;
  description?: string;
  /** A template's id: the project's configuration starts as version 1 from it. Default: the ADR template. */
  templateId?: string;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
}

/**
 * A project is private to its owner. Codes the UI handles: `project_not_found`
 * (404), `validation_error` (422, a name that is blank or too long),
 * `unknown_template` (422, `create` with a `templateId` that does not exist).
 */
export interface ProjectsApi {
  /** The first page, last activity first. */
  list(signal?: AbortSignal): Promise<Project[]>;
  /** One page, last activity first. Pass the `next` of the page before to get the one after it. */
  listPage(options?: { cursor?: string | null; signal?: AbortSignal }): Promise<ProjectPage>;
  /** Makes the project and its empty run, with the configuration (version 1, noted "From template: <name>") from the template. */
  create(input: NewProjectInput): Promise<Project>;
  get(projectId: string, signal?: AbortSignal): Promise<Project>;
  /** Changes the name and/or the description. */
  rename(projectId: string, patch: ProjectPatch): Promise<Project>;
  /** Deletes the project, its run and everything on it. */
  remove(projectId: string): Promise<void>;
}

// ── Templates ───────────────────────────────────────────────────────────

/** A complete configuration to start a project from: prompt, record types with fields, output. */
export interface DefinitionTemplate {
  id: string;
  name: string;
  description: string;
  definition: ExtractionDefinitionDraft;
}

/** Codes the UI handles: `template_not_found` (404). */
export interface TemplatesApi {
  /** Every template, the default first. */
  list(signal?: AbortSignal): Promise<DefinitionTemplate[]>;
}

// ── Extraction ──────────────────────────────────────────────────────────
//
// The extract stage is driven by a definition: a prompt, the record types to
// look for (an ADR, a policy requirement) and the fields of each. Its result
// is a list of records per file, and every value points at the text it came
// from, so the UI can show it as a highlight.

/**
 * How a field's value is taken from the document.
 * - quote:    copied exactly. The value is the text of its span.
 * - inferred: derived by the model (a status, a normalised date). Its spans
 *             are the passages it was based on.
 */
export const FIELD_MODES = ["quote", "inferred"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

export const FIELD_VALUE_TYPES = ["text", "date", "number", "choice"] as const;
export type FieldValueType = (typeof FIELD_VALUE_TYPES)[number];

export interface FieldDef {
  id: string;
  /** Name in the output and in templates, e.g. "approved_by". Unique within its record type. */
  key: string;
  /** Name people see, e.g. "Approved by". */
  name: string;
  /** What to look for: part of the instructions to the model. */
  description: string;
  mode: FieldMode;
  valueType: FieldValueType;
  /** The allowed values when `valueType` is "choice". */
  choices: string[];
  /** Whether one record can have several values for this field. */
  multiple: boolean;
}

export interface RecordType {
  id: string;
  /** e.g. "ADR" */
  name: string;
  description: string;
  /** May be empty: then a record is only its own span (the whole block of text). */
  fields: FieldDef[];
}

export const OUTPUT_FORMATS = ["json", "markdown", "csv"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export interface ExtractionOutputSettings {
  format: OutputFormat;
  /** For "markdown": the text of one record, with {{field_key}} placeholders. Otherwise unused. */
  template: string;
}

export const CHUNKING_STRATEGIES = ["auto", "heading", "paragraph", "fixed"] as const;
export type ChunkingStrategy = (typeof CHUNKING_STRATEGIES)[number];

/** How a document is cut into pieces before extraction. `size` (characters) is null for "auto". */
export interface ChunkingSettings {
  strategy: ChunkingStrategy;
  size: number | null;
}

/** What the server takes as a chunk size, in characters. The server's own limit may be lower. */
export const CHUNK_SIZE_MIN = 1000;
export const CHUNK_SIZE_MAX = 8000;
export const CHUNK_SIZE_DEFAULT = 4000;

/** The setting as the server stores it: automatic has no size, any other strategy has one (4000 if none given). */
export function normalChunking(chunking: ChunkingSettings | null | undefined): ChunkingSettings {
  if (!chunking || chunking.strategy === "auto") return { strategy: "auto", size: null };
  return { strategy: chunking.strategy, size: chunking.size ?? CHUNK_SIZE_DEFAULT };
}

export interface ExtractionDefinition {
  /** Goes up by one on every save. An extraction run names the version it used. */
  version: number;
  /** What to extract, in the person's words. */
  prompt: string;
  recordTypes: RecordType[];
  output: ExtractionOutputSettings;
  chunking: ChunkingSettings;
  /** Why this version was saved. Empty when the person gave none. */
  note: string;
  createdAt: string; // ISO-8601
}

export type ExtractionDefinitionDraft = Omit<
  ExtractionDefinition,
  "version" | "note" | "createdAt"
>;

/** One saved version in the list of versions. */
export interface DefinitionVersionSummary {
  version: number;
  note: string;
  createdAt: string; // ISO-8601
  recordTypeCount: number;
  fieldCount: number;
}

/** The longest note a version takes. */
export const MAX_DEFINITION_NOTE_LENGTH = 200;

/**
 * A stretch of the stage's input text (the enriched Markdown file, front
 * matter included). `start` and `end` count Unicode code points, not
 * JavaScript string indices: convert with lib/text-spans before slicing.
 */
export interface TextSpan {
  start: number;
  /** Exclusive. */
  end: number;
  /** The text of the span, kept so it can be found again if the offsets no longer fit. */
  quote: string;
}

export type AnnotationOrigin = "llm" | "human";

/** suggested: nobody has looked at it yet. */
export const REVIEW_STATES = ["suggested", "accepted", "rejected"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export interface FieldValue {
  id: string;
  fieldId: string;
  /** Null when the field was looked for and not found. */
  value: string | null;
  /** quote field: where the value is. inferred field: the evidence. */
  spans: TextSpan[];
  origin: AnnotationOrigin;
  review: ReviewState;
  /** False when a span's quote could not be found in the text. Shown, never dropped. */
  anchored: boolean;
}

export interface ExtractionRecord {
  id: string;
  fileId: string;
  recordTypeId: string;
  /** The whole block this record covers (e.g. one ADR), when there is one. */
  span: TextSpan | null;
  fields: FieldValue[];
  origin: AnnotationOrigin;
  review: ReviewState;
  /** Given to the model as an example in later extraction runs. */
  useAsExample: boolean;
}

/** Everything extracted from one file. */
export interface FileExtraction {
  fileId: string;
  /** Goes up on every change to the records, by a run or by a person. */
  revision: number;
  /** The ETag of the input text the spans refer to. */
  sourceEtag: string;
  /** The definition version the last extraction run used. */
  definitionVersion: number;
  records: ExtractionRecord[];
}

/** One value written by a person: the text and where it is in the document. */
export interface FieldValueInput {
  value: string | null;
  spans: TextSpan[];
}

export interface NewRecordInput {
  recordTypeId: string;
  /** The block the person selected, if they marked one. */
  span: TextSpan | null;
  /** Values to start with, by field id. Fields left out stay empty. */
  fields?: { fieldId: string; values: FieldValueInput[] }[];
}

export interface RecordPatch {
  review?: ReviewState;
  span?: TextSpan | null;
  useAsExample?: boolean;
}

// The assistant: a chat that turns a prompt into record types, fields and a
// template, and changes them on request. It proposes; the person applies.

export interface AssistantProposal {
  /** The whole definition as the assistant would have it. Not saved until the person applies it. */
  definition: ExtractionDefinitionDraft;
  /** Why, per change. `path` names what changed in plain words, e.g. "ADR / Approved by". */
  reasons: { path: string; reason: string }[];
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  proposal: AssistantProposal | null;
  /** streaming: the reply is still being written. */
  status: "streaming" | "done";
  createdAt: string; // ISO-8601
}

/** Parts of a reply, as they arrive over the live connection. */
export type AssistantEvent =
  | { type: "delta"; messageId: string; text: string }
  | { type: "proposal"; messageId: string; proposal: AssistantProposal }
  | { type: "done"; messageId: string };

export interface PublishResult {
  /** The version of the pipeline's extraction config that now holds this definition. */
  pipelineConfigVersion: number;
  /** How many example records went with it. */
  examples: number;
}

/**
 * Extraction runs like every other stage, through `RunsApi.executeStage` with
 * `config: { definitionVersion }`. Codes the UI handles here:
 * `definition_conflict` (409), `extraction_not_found` (404).
 *
 * The calls that change records take the `revision` the caller last saw and
 * resolve with the file's new state. If someone else changed the records in
 * between they reject with `revision_conflict` (409): fetch and try again.
 * What a person writes is `origin: "human"` and `review: "accepted"`, and an
 * extraction run never replaces it.
 */
export interface ExtractionApi {
  /** The run's definition. It starts as a copy of the pipeline's extraction config. */
  getDefinition(runId: string, signal?: AbortSignal): Promise<ExtractionDefinition>;
  /**
   * Saves a new version, with an optional note (`MAX_DEFINITION_NOTE_LENGTH`
   * characters). Rejects with `definition_conflict` if `baseVersion` is not the latest.
   */
  saveDefinition(
    runId: string,
    draft: ExtractionDefinitionDraft,
    baseVersion: number,
    note?: string,
  ): Promise<ExtractionDefinition>;
  /** Every saved version, newest first. Versions are never changed or deleted. */
  listDefinitionVersions(runId: string, signal?: AbortSignal): Promise<DefinitionVersionSummary[]>;
  /** One saved version. Rejects with `definition_version_not_found` (404). */
  getDefinitionVersion(
    runId: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<ExtractionDefinition>;
  /** Saves a copy of that version as the newest one (note "Restored from version N") and returns it. */
  restoreDefinitionVersion(runId: string, version: number): Promise<ExtractionDefinition>;
  /** The records of one file. Rejects with `extraction_not_found` before the first run. */
  getFileExtraction(runId: string, fileId: string, signal?: AbortSignal): Promise<FileExtraction>;
  /** Adds a record a person marked. Works before any extraction run: the file then starts at revision 1. */
  addRecord(
    runId: string,
    fileId: string,
    input: NewRecordInput,
    revision: number,
  ): Promise<FileExtraction>;
  /** Accepting a record also accepts its values that are still suggestions. */
  updateRecord(
    runId: string,
    fileId: string,
    recordId: string,
    patch: RecordPatch,
    revision: number,
  ): Promise<FileExtraction>;
  /**
   * Removes a record a person added. A record the model suggested can't be
   * deleted (`not_deletable`, 422): reject it instead, so it isn't suggested again.
   */
  deleteRecord(
    runId: string,
    fileId: string,
    recordId: string,
    revision: number,
  ): Promise<FileExtraction>;
  /** Replaces every value of one field of a record. An empty list leaves the field "not found". */
  setFieldValues(
    runId: string,
    fileId: string,
    recordId: string,
    fieldId: string,
    values: FieldValueInput[],
    revision: number,
  ): Promise<FileExtraction>;
  /** Accepts or rejects one value. */
  setValueReview(
    runId: string,
    fileId: string,
    recordId: string,
    valueId: string,
    review: ReviewState,
    revision: number,
  ): Promise<FileExtraction>;
  /** The conversation with the assistant so far, oldest first. */
  getAssistantMessages(runId: string, signal?: AbortSignal): Promise<AssistantMessage[]>;
  /**
   * Sends what the person typed, with the definition as it is on their screen
   * (saved or not). Resolves with their message once accepted; the reply
   * arrives as `AssistantEvent`s. `assistant_busy` (409) while a reply is being written.
   */
  sendAssistantMessage(
    runId: string,
    text: string,
    definition: ExtractionDefinitionDraft,
  ): Promise<AssistantMessage>;
  /** Removes the whole conversation. The definition and the records stay. `assistant_busy` (409) while a reply is being written. */
  clearAssistantMessages(runId: string): Promise<void>;
  /**
   * Writes the saved definition, and the accepted records marked as examples,
   * to the pipeline's extraction config, so every document of the pipeline is
   * extracted the same way.
   */
  publishDefinition(runId: string): Promise<PublishResult>;
}

export interface ExtractionChange {
  fileId: string;
  revision: number;
}

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface RunEventHandlers {
  onCell(cell: StageCell): void;
  /** A file's records changed (a run finished, or someone edited them): fetch them again. */
  onExtractionChanged?(change: ExtractionChange): void;
  /** Part of a reply from the assistant. */
  onAssistantEvent?(event: AssistantEvent): void;
  /** The run's documents changed: fetch the snapshot again. */
  onRunChanged?(): void;
  /** The conversation with the assistant was cleared (here or elsewhere). */
  onAssistantCleared?(): void;
  onStateChange?(state: ConnectionState): void;
  /** The connection is (back) up. Cells may have been missed: fetch the snapshot. */
  onOpen?(): void;
}

export interface RunEvents {
  /** Returns the function that ends the subscription. */
  subscribe(runId: string, handlers: RunEventHandlers): () => void;
}

/** One document's text as stored, with its version. */
export interface DocumentContent {
  text: string;
  contentType: string;
  /** Changes whenever the document changes. Extraction keeps it as `sourceEtag`. */
  etag: string;
}

/**
 * Documents in the storage container (Knowledge Studio). The API reads them
 * with the signed-in person's own access, so a person only ever gets
 * documents they may open. Listing goes through `catalog.list("storage", …)`.
 * Rejects with an ApiError: `document_not_found` (404), `forbidden` (403).
 */
export interface DocumentsApi {
  /** `documentId` is the id the catalog listed (a run file's `sourceRef`). */
  get(documentId: string, signal?: AbortSignal): Promise<DocumentContent>;
}

/** What a part of the backend is: a stand-in (`stub`) or the real thing. */
export type StatusMode = "stub" | "real";
/** `stub`: a stand-in, nothing to check. `unknown`: real, but not checked or called yet. */
export type StatusState = "stub" | "ok" | "failing" | "unknown";

/**
 * One part of the backend (the assistant, extraction, storage, sign-in, live updates, the
 * worker). `id` is open: a backend may report a part this UI has never heard of.
 */
export interface StatusPart {
  id: string;
  mode: StatusMode;
  /** For people: the provider and model name at most, never an address or a key. */
  label: string;
  state: StatusState;
  /** When the state was last learned (a real call or a check), ISO 8601. */
  checkedAt: string | null;
  /** A short machine code for a failing part (`auth_failed`, `timeout`, ...), never a message. */
  problem: string | null;
}

export interface BackendStatus {
  environment: string;
  parts: StatusPart[];
}

export interface StatusTestResult {
  status: BackendStatus;
  /** The backend answered with its stored result (`X-Status-Test: cached`): no new check ran. */
  cached: boolean;
}

/**
 * What the backend is made of right now. Both calls resolve to `null` when the backend does
 * not report its status (a 404): that is an answer, not an error.
 */
export interface StatusApi {
  /** Reads the stored status. Makes no outside call on the server. */
  get(signal?: AbortSignal): Promise<BackendStatus | null>;
  /** Checks every real part now (at most once a minute for the deployment), or answers the stored result. */
  test(signal?: AbortSignal): Promise<StatusTestResult | null>;
}

export interface Services {
  status: StatusApi;
  catalog: SourceCatalog;
  documents: DocumentsApi;
  projects: ProjectsApi;
  templates: TemplatesApi;
  runs: RunsApi;
  extraction: ExtractionApi;
  events: RunEvents;
}
