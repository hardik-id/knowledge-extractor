import { ApiError } from "@/lib/api/api-error";
import { toMarkdownName } from "@/lib/format";
import { newId } from "@/lib/id";
import { codePointToIndex, indexToCodePoint } from "@/lib/text-spans";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import { DEFAULT_TEMPLATE_ID, MOCK_TEMPLATES } from "@/mocks/templates";
import { MOCK_DOCUMENTS, mockDocumentText } from "@/mocks/documents";
import { MOCK_FILES } from "@/mocks/files";
import {
  mockClassifiedMarkdownFor,
  mockEnrichedMarkdownFor,
  mockMarkdownFor,
} from "@/mocks/markdown";
import type { FileType, SourceFile, SourceKind } from "@/types/pipeline";
import {
  WORK_STAGE_IDS,
  type AssistantEvent,
  type AssistantMessage,
  type ConnectionState,
  type DefinitionVersionSummary,
  type DocumentContent,
  type ExecuteStageOptions,
  type ExtractionChange,
  type Execution,
  type DefinitionTemplate,
  type ExtractionDefinition,
  type ExtractionDefinitionDraft,
  type ExtractionRecord,
  type FieldDef,
  type FieldValue,
  type FieldValueInput,
  type FileExtraction,
  type NewWorkspaceInput,
  type NewRecordInput,
  type Workspace,
  type WorkspacePage,
  type WorkspacePatch,
  type PublishResult,
  type RecordPatch,
  type ReviewState,
  type TextSpan,
  MAX_DEFINITION_NOTE_LENGTH,
  CHUNK_SIZE_DEFAULT,
  CHUNK_SIZE_MAX,
  CUSTOM_INSTRUCTION_MAX,
  type CustomChunkingDocument,
  type CustomChunkingRequest,
  type CustomChunkingResult,
  CHUNK_SIZE_MIN,
  normalChunking,
  type Run,
  type RunEventHandlers,
  type RunFile,
  type StageCell,
  type StageOutputContent,
  type StageOutputMeta,
  type WorkStageId,
} from "../contracts";
import { assistantReply } from "./mock-assistant";
import { mergeExtractedRecords } from "./extraction-merge";
import { extractRecords } from "./mock-extractor";

/**
 * An in-browser stand-in for the Django API and its WebSocket. It follows the
 * same rules the real backend will: work is asynchronous, state is a cell per
 * file and stage, one execution per stage at a time, and running a stage again
 * makes the later stages stale.
 *
 * Stored files follow the real backend: transform writes name.md and nothing
 * changes it afterwards. Classify writes a copy of that Markdown with front
 * matter added; enrich edits that same copy in place. So classify and enrich
 * share one file: after enrich, both return the enriched text, and running
 * classify again writes a fresh copy, which drops the enrichment.
 *
 * State is kept in the browser so a page reload finds the run again, the way
 * it would on a real server. Runs that belong to a workspace, and the workspaces,
 * are kept in localStorage, so they survive closing the browser. Other runs
 * (the pipeline's) stay in sessionStorage, one per tab.
 */

const DEFAULT_STORAGE_KEY = "knowledge-extractor:mock-backend";
const DEFAULT_WORKSPACES_KEY = "knowledge-extractor:mock-workspaces";
const MAX_WORKSPACE_NAME_LENGTH = 120;

const LATENCY_MS = 150;
const WORKSPACE_PAGE_SIZE = 20;
const QUEUE_STAGGER_MS = 250;
const INGEST_STEPS = 10;
const WORK_MS: Record<Exclude<WorkStageId, "ingest">, number> = {
  transform: 350,
  classify: 500,
  enrich: 600,
  extract: 700,
  index: 500,
};

const CONTENT_TYPE: Record<FileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html",
  md: "text/markdown",
  txt: "text/plain",
};

interface MockRun {
  id: string;
  createdAt: string;
  files: RunFile[];
  /** Keyed by `${fileId}:${stage}`. */
  cells: Record<string, StageCell>;
  /**
   * Which stage last wrote the copy that classify and enrich share, by file id.
   * Runs saved before this field existed don't have it.
   */
  sharedWriter?: Record<string, SharedWriter>;
  /** The extraction definition, created from the default on first use. Older runs don't have it. */
  definition?: ExtractionDefinition;
  /** The records of each file's last extraction, by file id. Older runs don't have it. */
  extractions?: Record<string, FileExtraction>;
  /** The conversation with the assistant, oldest first. Older runs don't have it. */
  assistant?: AssistantMessage[];
  /** How often the definition was published. Older runs don't have it. */
  publishedVersion?: number;
  /** The stages this run has, in order. Older runs don't have it: they are the full pipeline. */
  workStages?: readonly WorkStageId[];
  /**
   * Where extraction reads its text. `enrich`: the enrich stage's output.
   * `document`: the stored document named by the run file's `sourceRef`. Older runs don't have it.
   */
  extractionInput?: "enrich" | "document";
  /** The workspace that owns this run. Such a run is deleted with its workspace only. */
  workspaceId?: string;
  /** The saved versions of the definition before the current one, oldest first. */
  previousDefinitions?: ExtractionDefinition[];
  /** The last change a person made to the records or the documents. */
  activityAt?: string;
}

interface MockWorkspace {
  id: string;
  name: string;
  description: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
}

type SharedWriter = "classify" | "enrich";

interface Subscription {
  runId: string;
  handlers: RunEventHandlers;
  open: boolean;
}

export interface MockBackendOptions {
  /** Multiplies every delay. 0 makes the mock as fast as timers allow (for tests). */
  speed?: number;
  /** Where to keep state between reloads. Default: sessionStorage when there is one. */
  storage?: MockStorage | null;
  /** The key the state is kept under. One per app, so two apps on one origin keep apart. */
  storageKey?: string;
  /** Where to keep workspaces and their runs. Default: localStorage when there is one. */
  persistentStorage?: MockStorage | null;
  persistentStorageKey?: string;
}

type MockStorage = Pick<Storage, "getItem" | "setItem"> & { removeItem?(key: string): void };

/** What a run is made of decides its stages and where extraction reads its text. */
function planFor(files: readonly SourceFile[]): {
  workStages: readonly WorkStageId[];
  extractionInput: "enrich" | "document";
} {
  const documents = files.filter((f) => f.source === "storage").length;
  if (documents > 0 && documents < files.length) {
    throw new ApiError({
      status: 422,
      code: "mixed_sources",
      message: "A run can't mix storage documents with other files.",
    });
  }
  return documents > 0
    ? { workStages: ["extract"], extractionInput: "document" }
    : { workStages: WORK_STAGE_IDS, extractionInput: "enrich" };
}

const key = (fileId: string, stage: WorkStageId) => `${fileId}:${stage}`;

const isActive = (cell: StageCell) => cell.status === "queued" || cell.status === "running";

const byteLength = (text: string) => new TextEncoder().encode(text).length;

function defaultStorage(): MockStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked by the browser
  }
}

function defaultPersistentStorage(): MockStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked by the browser
  }
}

const badRequest = (message: string) =>
  new ApiError({ status: 422, code: "validation_error", message });

/** A workspace name as stored: trimmed, not blank, not too long. */
function checkName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) throw badRequest("A workspace needs a name.");
  if (trimmed.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw badRequest(`A workspace name takes at most ${MAX_WORKSPACE_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

const countFields = (definition: ExtractionDefinition) =>
  definition.recordTypes.reduce((n, t) => n + t.fields.length, 0);

/** The text a stage writes when it succeeds. */
function outputText(file: RunFile, stage: WorkStageId): string {
  if (stage === "transform") return mockMarkdownFor(file);
  if (stage === "classify") return mockClassifiedMarkdownFor(file);
  if (stage === "enrich") return mockEnrichedMarkdownFor(file);
  if (stage === "ingest") return `Original file: ${file.name}`;
  return JSON.stringify({ stage, file: file.name, note: "Example output from the mock." }, null, 2);
}

/** Describes what the stage just wrote. Classify and enrich name the one shared file. */
function outputMeta(file: RunFile, stage: WorkStageId, executionId: string): StageOutputMeta {
  const etag = `${stage}-${executionId}`;
  if (stage === "ingest") {
    return {
      name: file.name,
      contentType: CONTENT_TYPE[file.type],
      sizeBytes: file.sizeBytes,
      etag,
    };
  }
  const text = outputText(file, stage);
  return stage === "transform" || stage === "classify" || stage === "enrich"
    ? {
        name: toMarkdownName(file.name),
        contentType: "text/markdown",
        sizeBytes: byteLength(text),
        etag,
      }
    : {
        name: `${toMarkdownName(file.name).replace(/\.md$/, "")}.${stage}.json`,
        contentType: "application/json",
        sizeBytes: byteLength(text),
        etag,
      };
}

interface ChangeContext {
  extraction: FileExtraction;
  definition: ExtractionDefinition;
  record(id: string): ExtractionRecord;
  /** Rejects with `invalid_span` unless the text at the span is its quote. */
  checkSpan(span: TextSpan): void;
  /** Values a person wrote for one field, as stored. An empty list gives one "not found" value. */
  valuesFor(field: FieldDef, inputs: FieldValueInput[]): FieldValue[];
}

const unknownField = () =>
  new ApiError({
    status: 422,
    code: "unknown_field",
    message: "This record type or field is not in the extraction definition.",
  });

function checkSpan(text: string, span: TextSpan) {
  const start = codePointToIndex(text, span.start);
  const end = codePointToIndex(text, span.end);
  if (!(span.start >= 0 && span.end >= span.start) || text.slice(start, end) !== span.quote) {
    throw new ApiError({
      status: 422,
      code: "invalid_span",
      message: "The marked text does not match the document.",
    });
  }
}

const GENERATE_LATENCY_MS = 1500;

/** The code the mock "writes": the same rule as `mockSplit`, in the language the server uses. */
const MOCK_SPLIT_CODE = `def split(text: str, size: int) -> list[tuple[int, int]]:
    """Cut at each level-2 heading; cut a longer part every \`size\` characters."""
    starts = [0]
    pos = 0
    for line in text.splitlines(keepends=True):
        if line.startswith("## ") and pos > 0:
            starts.append(pos)
        pos += len(line)
    ends = starts[1:] + [len(text)]
    ranges = []
    for start, end in zip(starts, ends):
        while end - start > size:
            ranges.append((start, start + size))
            start += size
        if end > start:
            ranges.append((start, end))
    return ranges
`;

/** The mock's splitter: contiguous character ranges from 0 to the end, none longer than `size`. */
export function mockSplit(text: string, size: number): Array<[number, number]> {
  if (!text) return [];
  const starts = [0];
  let pos = 0;
  for (const line of text.split(/(?<=\n)/)) {
    if (line.startsWith("## ") && pos > 0) starts.push(pos);
    pos += line.length;
  }
  const ends = [...starts.slice(1), text.length];
  const ranges: Array<[number, number]> = [];
  starts.forEach((s, i) => {
    let start = s;
    const end = ends[i]!;
    while (end - start > size) {
      ranges.push([start, start + size]);
      start += size;
    }
    if (end > start) ranges.push([start, end]);
  });
  return ranges;
}

export class MockBackend {
  private readonly runs = new Map<string, MockRun>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly workspaces = new Map<string, MockWorkspace>();
  private readonly storage: MockStorage | null;
  private readonly storageKey: string;
  private readonly persistentStorage: MockStorage | null;
  private readonly persistentStorageKey: string;
  private readonly failNextStages = new Set<WorkStageId>();
  private unanchorNextExtraction = false;
  private failNextGenerate: { status: number; code: string; message: string } | null = null;
  private readonly examplesUsed = new Map<string, number>();
  private speed: number;
  private connected = true;
  private lastTimestamp = 0;

  constructor(options: MockBackendOptions = {}) {
    this.speed = options.speed ?? 1;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.persistentStorage =
      options.persistentStorage === undefined
        ? defaultPersistentStorage()
        : options.persistentStorage;
    this.persistentStorageKey = options.persistentStorageKey ?? DEFAULT_WORKSPACES_KEY;
    this.restore();
  }

  // ── Source catalog ────────────────────────────────────────────────────

  async listFiles(source: SourceKind, query: string, signal?: AbortSignal): Promise<SourceFile[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const q = query.trim().toLowerCase();
    return [...MOCK_FILES, ...MOCK_DOCUMENTS].filter(
      (f) =>
        f.source === source &&
        (!q || f.name.toLowerCase().includes(q) || f.location.toLowerCase().includes(q)),
    );
  }

  // ── Documents ─────────────────────────────────────────────────────────

  async getDocument(documentId: string, signal?: AbortSignal): Promise<DocumentContent> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const text = mockDocumentText(documentId);
    const document = MOCK_DOCUMENTS.find((d) => d.id === documentId);
    if (text === undefined || !document?.etag) {
      throw new ApiError({
        status: 404,
        code: "document_not_found",
        message: "This document does not exist, or you may not open it.",
      });
    }
    return { text, contentType: CONTENT_TYPE.md, etag: document.etag };
  }

  // ── Workspaces ──────────────────────────────────────────────────────────

  async listWorkspaces(signal?: AbortSignal): Promise<Workspace[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return [...this.workspaces.values()]
      .map((workspace) => this.workspaceView(workspace))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  /** A page of the list. The cursor is the offset into the ordered list, as text. */
  async listWorkspacesPage(
    options: { cursor?: string | null; signal?: AbortSignal; pageSize?: number } = {},
  ): Promise<WorkspacePage> {
    const all = await this.listWorkspaces(options.signal);
    const size = options.pageSize ?? WORKSPACE_PAGE_SIZE;
    const start = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
    if (!Number.isInteger(start) || start < 0) throw badRequest("The cursor is not valid.");
    const end = start + size;
    return { items: all.slice(start, end), next: end < all.length ? String(end) : null };
  }

  /** The templates a workspace can start from, the default first. */
  async listTemplates(signal?: AbortSignal): Promise<DefinitionTemplate[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return structuredClone([...MOCK_TEMPLATES]);
  }

  async createWorkspace(input: NewWorkspaceInput): Promise<Workspace> {
    await this.wait(LATENCY_MS);
    const name = checkName(input.name);
    const template = MOCK_TEMPLATES.find((t) => t.id === (input.templateId ?? DEFAULT_TEMPLATE_ID));
    if (!template) {
      throw new ApiError({
        status: 422,
        code: "unknown_template",
        message: "This template does not exist.",
      });
    }
    if (input.description !== undefined && typeof input.description !== "string") {
      throw badRequest("The description must be text.");
    }
    const now = this.timestamp();
    const workspace: MockWorkspace = {
      id: `workspace_${newId()}`,
      name,
      description: input.description ?? "",
      runId: `run_${newId()}`,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(workspace.runId, {
      id: workspace.runId,
      createdAt: now,
      files: [],
      cells: {},
      sharedWriter: {},
      workStages: ["extract"],
      extractionInput: "document",
      workspaceId: workspace.id,
      definition: {
        ...structuredClone(template.definition),
        version: 1,
        note: `From template: ${template.name}`,
        createdAt: now,
      },
    });
    this.workspaces.set(workspace.id, workspace);
    this.save();
    return this.workspaceView(workspace);
  }

  async getWorkspace(workspaceId: string, signal?: AbortSignal): Promise<Workspace> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return this.workspaceView(this.requireWorkspace(workspaceId));
  }

  async updateWorkspace(workspaceId: string, patch: WorkspacePatch): Promise<Workspace> {
    await this.wait(LATENCY_MS);
    const workspace = this.requireWorkspace(workspaceId);
    const name = patch.name === undefined ? workspace.name : checkName(patch.name);
    if (patch.description !== undefined && typeof patch.description !== "string") {
      throw badRequest("The description must be text.");
    }
    workspace.name = name;
    workspace.description = patch.description ?? workspace.description;
    workspace.updatedAt = this.timestamp();
    this.save();
    return this.workspaceView(workspace);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.wait(LATENCY_MS);
    const workspace = this.requireWorkspace(workspaceId);
    this.workspaces.delete(workspace.id);
    this.runs.delete(workspace.runId);
    for (const subscription of [...this.subscriptions]) {
      if (subscription.runId !== workspace.runId) continue;
      this.subscriptions.delete(subscription);
      subscription.handlers.onStateChange?.("closed");
    }
    this.save();
  }

  // ── Runs ──────────────────────────────────────────────────────────────

  async createRun(files: SourceFile[]): Promise<Run> {
    await this.wait(LATENCY_MS);
    if (files.length === 0) {
      throw new ApiError({ status: 422, code: "no_files", message: "Select at least one file." });
    }

    const plan = planFor(files);
    const run: MockRun = {
      id: `run_${newId()}`,
      createdAt: this.timestamp(),
      files: files.map((file) => ({ ...file, id: `file_${newId()}`, sourceRef: file.id })),
      cells: {},
      sharedWriter: {},
      ...plan,
    };
    for (const file of run.files) {
      for (const stage of plan.workStages) {
        run.cells[key(file.id, stage)] = {
          fileId: file.id,
          stage,
          status: "pending",
          executionId: null,
          progress: null,
          error: null,
          output: null,
          updatedAt: run.createdAt,
        };
      }
    }
    this.runs.set(run.id, run);
    this.save();
    return this.snapshot(run);
  }

  async setDocuments(runId: string, files: SourceFile[]): Promise<Run> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    if (Object.values(run.cells).some(isActive)) {
      throw new ApiError({
        status: 409,
        code: "execution_in_progress",
        message: "The run is working: wait for it to finish.",
      });
    }
    if (files.length > 0) {
      const plan = planFor(files);
      if (plan.extractionInput !== (run.extractionInput ?? "enrich")) {
        throw new ApiError({
          status: 422,
          code: "mixed_sources",
          message: "These files are not the kind of file this run takes.",
        });
      }
    }
    const workStages = run.workStages ?? WORK_STAGE_IDS;
    const wanted = new Map<string, SourceFile>();
    for (const file of files) if (!wanted.has(file.id)) wanted.set(file.id, file);

    const kept = new Map(run.files.map((f) => [f.sourceRef, f]));
    for (const file of run.files) {
      if (wanted.has(file.sourceRef)) continue;
      for (const stage of workStages) delete run.cells[key(file.id, stage)];
      delete run.extractions?.[file.id];
      delete run.sharedWriter?.[file.id];
    }
    const now = this.timestamp();
    run.files = [...wanted.values()].map((file) => {
      const existing = kept.get(file.id);
      if (existing) return existing;
      const added: RunFile = { ...file, id: `file_${newId()}`, sourceRef: file.id };
      for (const stage of workStages) {
        run.cells[key(added.id, stage)] = {
          fileId: added.id,
          stage,
          status: "pending",
          executionId: null,
          progress: null,
          error: null,
          output: null,
          updatedAt: now,
        };
      }
      return added;
    });
    run.activityAt = now;
    this.save();
    this.notifyRun(run, (handlers) => handlers.onRunChanged?.());
    return this.snapshot(run);
  }

  async getRun(runId: string, signal?: AbortSignal): Promise<Run> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return this.snapshot(this.requireRun(runId));
  }

  async executeStage(
    runId: string,
    stage: WorkStageId,
    options: ExecuteStageOptions = {},
  ): Promise<Execution> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    const fileIds = options.fileIds ?? run.files.map((f) => f.id);

    const unknown = fileIds.find((id) => !run.files.some((f) => f.id === id));
    if (unknown || fileIds.length === 0) {
      throw new ApiError({
        status: 422,
        code: "unknown_file",
        message: "One of the files is not part of this run.",
      });
    }

    const active = Object.values(run.cells).find((c) => c.stage === stage && isActive(c));
    if (active) {
      throw new ApiError({
        status: 409,
        code: "execution_in_progress",
        message: "This stage is already running.",
        details: { executionId: active.executionId },
      });
    }

    const workStages = run.workStages ?? WORK_STAGE_IDS;
    const stageAt = workStages.indexOf(stage);
    const previous = workStages[stageAt - 1];
    if (previous && fileIds.some((id) => run.cells[key(id, previous)].status !== "succeeded")) {
      throw new ApiError({
        status: 422,
        code: "upstream_not_ready",
        message: "The previous stage has not finished for every file.",
      });
    }

    // Work built on the old output of this stage is now out of date.
    for (const later of workStages.slice(stageAt + 1)) {
      for (const id of fileIds) {
        if (run.cells[key(id, later)].status !== "pending") {
          this.update(run, id, later, { status: "stale", progress: null });
        }
      }
    }

    if (stage === "extract") {
      const wanted = options.config?.definitionVersion;
      if (wanted !== undefined && wanted !== this.ensureDefinition(run).version) {
        throw new ApiError({
          status: 409,
          code: "definition_conflict",
          message: "The extraction definition has changed since it was loaded.",
        });
      }
    }

    const execution: Execution = { id: `exec_${newId()}`, stage, fileIds };
    const fail = this.failNextStages.delete(stage);
    const unanchor = stage === "extract" && this.unanchorNextExtraction;
    if (stage === "extract") this.unanchorNextExtraction = false;
    fileIds.forEach((id, index) => {
      this.update(run, id, stage, {
        status: "queued",
        executionId: execution.id,
        progress: null,
        error: null,
        output: null,
      });
      void this.work(
        run.id,
        id,
        stage,
        execution.id,
        index,
        fail && index === 0,
        unanchor && index === 0,
      );
    });
    return execution;
  }

  async getOutput(
    runId: string,
    fileId: string,
    stage: WorkStageId,
    signal?: AbortSignal,
  ): Promise<StageOutputContent> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const run = this.requireRun(runId);
    const file = run.files.find((f) => f.id === fileId);
    const cell = run.cells[key(fileId, stage)];
    if (!file || !cell?.output) {
      throw new ApiError({
        status: 404,
        code: "output_not_found",
        message: "This file has no output for this stage yet.",
      });
    }
    // Classify and enrich return the shared copy as it was last written.
    const text =
      stage === "classify" || stage === "enrich"
        ? outputText(file, run.sharedWriter?.[fileId] ?? stage)
        : outputText(file, stage);
    return { text, contentType: cell.output.contentType };
  }

  // ── Extraction ────────────────────────────────────────────────────────

  async getDefinition(runId: string, signal?: AbortSignal): Promise<ExtractionDefinition> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return structuredClone(this.ensureDefinition(this.requireRun(runId)));
  }

  async saveDefinition(
    runId: string,
    draft: ExtractionDefinitionDraft,
    baseVersion: number,
    note = "",
  ): Promise<ExtractionDefinition> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    const current = this.ensureDefinition(run);
    if (note.trim().length > MAX_DEFINITION_NOTE_LENGTH) {
      throw new ApiError({
        status: 422,
        code: "invalid_definition",
        message: `A note takes at most ${MAX_DEFINITION_NOTE_LENGTH} characters.`,
      });
    }
    if (baseVersion !== current.version) {
      throw new ApiError({
        status: 409,
        code: "definition_conflict",
        message: "Someone saved a newer version of this definition.",
        details: { version: current.version },
      });
    }
    for (const recordType of draft.recordTypes) {
      const keys = recordType.fields.map((f) => f.key.trim());
      if (keys.some((k) => !k) || new Set(keys).size !== keys.length) {
        throw new ApiError({
          status: 422,
          code: "invalid_definition",
          message: `The fields of "${recordType.name}" need a key each, and no two may share one.`,
        });
      }
    }
    if (draft.chunking?.strategy === "custom" && !draft.chunking.custom?.code?.trim()) {
      throw new ApiError({
        status: 422,
        code: "validation_error",
        message: "Generate and apply the splitting code first.",
        details: {
          errors: [{ path: "chunking", message: "Generate and apply the splitting code first." }],
        },
      });
    }
    const size = draft.chunking?.size;
    if (
      draft.chunking &&
      draft.chunking.strategy !== "auto" &&
      size != null &&
      (!Number.isInteger(size) || size < CHUNK_SIZE_MIN || size > CHUNK_SIZE_MAX)
    ) {
      throw new ApiError({
        status: 422,
        code: "invalid_definition",
        message: "The definition is not valid.",
        details: {
          errors: [
            {
              path: "chunking",
              message: `The chunk size must be between ${CHUNK_SIZE_MIN} and ${CHUNK_SIZE_MAX} characters.`,
            },
          ],
        },
      });
    }
    return this.pushDefinition(run, draft, current.version + 1, note.trim());
  }

  async listDefinitionVersions(
    runId: string,
    signal?: AbortSignal,
  ): Promise<DefinitionVersionSummary[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const run = this.requireRun(runId);
    this.ensureDefinition(run);
    return this.allDefinitions(run)
      .reverse()
      .map((d) => ({
        version: d.version,
        note: d.note,
        createdAt: d.createdAt,
        recordTypeCount: d.recordTypes.length,
        fieldCount: countFields(d),
      }));
  }

  async getDefinitionVersion(
    runId: string,
    version: number,
    signal?: AbortSignal,
  ): Promise<ExtractionDefinition> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return structuredClone(this.requireVersion(this.requireRun(runId), version));
  }

  /**
   * Stands in for the server's agent: waits a moment, then answers with a fixed splitter (cut at
   * each "## " heading, long parts cut at `size`) and the parts it makes of up to five documents.
   * `failNextChunkingGenerate` makes the next call fail instead.
   */
  async generateCustomChunking(
    runId: string,
    request: CustomChunkingRequest,
    signal?: AbortSignal,
  ): Promise<CustomChunkingResult> {
    await this.wait(GENERATE_LATENCY_MS);
    signal?.throwIfAborted();
    const run = this.requireRun(runId);
    const failure = this.failNextGenerate;
    this.failNextGenerate = null;
    if (failure) throw new ApiError(failure);
    const instruction = request.instruction.trim();
    if (!instruction || instruction.length > CUSTOM_INSTRUCTION_MAX) {
      throw new ApiError({
        status: 422,
        code: "validation_error",
        message: "The request is not valid.",
        details: {
          errors: [
            {
              path: "instruction",
              message: `Describe how to split, in up to ${CUSTOM_INSTRUCTION_MAX} characters.`,
            },
          ],
        },
      });
    }
    if (request.sourceUrl && !/^https:\/\/[^\s/]+/i.test(request.sourceUrl)) {
      throw new ApiError({
        status: 422,
        code: "validation_error",
        message: "The request is not valid.",
        details: {
          errors: [
            { path: "source_url", message: "Only https links to public pages are allowed." },
          ],
        },
      });
    }
    const size = request.size ?? CHUNK_SIZE_DEFAULT;
    const documents: CustomChunkingDocument[] = [];
    for (const file of run.files.slice(0, 5)) {
      const input = this.extractionInput(run, file.id);
      if (!input) continue;
      documents.push({
        fileId: file.id,
        name: file.name,
        // The server counts characters (code points), not UTF-16 units.
        characters: indexToCodePoint(input.text, input.text.length),
        parts: mockSplit(input.text, size).map(([start, end]) => ({
          start: indexToCodePoint(input.text, start),
          end: indexToCodePoint(input.text, end),
          startsWith: input.text.slice(start, end).trim().split("\n")[0]!.slice(0, 80),
        })),
      });
    }
    return {
      code: MOCK_SPLIT_CODE,
      summary: "Splits at each level-2 heading; a part longer than the size is cut at the size.",
      documents,
    };
  }

  /** Make the next `generateCustomChunking` fail with this answer (default: the agent gave up). */
  failNextChunkingGeneration(
    failure: { status: number; code: string; message: string } = {
      status: 422,
      code: "custom_chunking_failed",
      message:
        "The assistant could not write splitting code that works on these documents. Try describing it differently.",
    },
  ): void {
    this.failNextGenerate = failure;
  }

  async restoreDefinitionVersion(runId: string, version: number): Promise<ExtractionDefinition> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    const source = this.requireVersion(run, version);
    return this.pushDefinition(
      run,
      source,
      this.ensureDefinition(run).version + 1,
      `Restored from version ${version}`,
    );
  }

  async getFileExtraction(
    runId: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<FileExtraction> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const extraction = this.requireRun(runId).extractions?.[fileId];
    if (!extraction) {
      throw new ApiError({
        status: 404,
        code: "extraction_not_found",
        message: "This file has not been extracted yet.",
      });
    }
    return structuredClone(extraction);
  }

  async addRecord(
    runId: string,
    fileId: string,
    input: NewRecordInput,
    revision: number,
  ): Promise<FileExtraction> {
    return this.change(runId, fileId, revision, true, (ctx) => {
      const type = ctx.definition.recordTypes.find((t) => t.id === input.recordTypeId);
      if (!type) throw unknownField();
      if (input.span) ctx.checkSpan(input.span);
      const given = input.fields ?? [];
      const values: FieldValue[] = [];
      for (const field of type.fields) {
        const inputs = given.filter((g) => g.fieldId === field.id).flatMap((g) => g.values);
        values.push(...ctx.valuesFor(field, inputs));
      }
      if (given.some((g) => !type.fields.some((f) => f.id === g.fieldId))) throw unknownField();
      ctx.extraction.records.push({
        id: `rec_${newId()}`,
        fileId,
        recordTypeId: type.id,
        span: input.span ? { ...input.span } : null,
        fields: values,
        origin: "human",
        review: "accepted",
        useAsExample: false,
      });
    });
  }

  async updateRecord(
    runId: string,
    fileId: string,
    recordId: string,
    patch: RecordPatch,
    revision: number,
  ): Promise<FileExtraction> {
    return this.change(runId, fileId, revision, false, (ctx) => {
      const record = ctx.record(recordId);
      if (patch.span) ctx.checkSpan(patch.span);
      if (patch.span !== undefined) record.span = patch.span && { ...patch.span };
      if (patch.useAsExample !== undefined) record.useAsExample = patch.useAsExample;
      if (patch.review !== undefined) {
        record.review = patch.review;
        if (patch.review === "accepted") {
          for (const value of record.fields) {
            if (value.review === "suggested") value.review = "accepted";
          }
        }
      }
    });
  }

  async deleteRecord(
    runId: string,
    fileId: string,
    recordId: string,
    revision: number,
  ): Promise<FileExtraction> {
    return this.change(runId, fileId, revision, false, (ctx) => {
      const record = ctx.record(recordId);
      if (record.origin !== "human") {
        throw new ApiError({
          status: 422,
          code: "not_deletable",
          message: "A suggestion can't be deleted. Reject it instead.",
        });
      }
      ctx.extraction.records = ctx.extraction.records.filter((r) => r !== record);
    });
  }

  async setFieldValues(
    runId: string,
    fileId: string,
    recordId: string,
    fieldId: string,
    values: FieldValueInput[],
    revision: number,
  ): Promise<FileExtraction> {
    return this.change(runId, fileId, revision, false, (ctx) => {
      const record = ctx.record(recordId);
      const field = ctx.definition.recordTypes
        .find((t) => t.id === record.recordTypeId)
        ?.fields.find((f) => f.id === fieldId);
      if (!field) throw unknownField();
      // A value sent back unchanged is not a new statement by the person: it keeps
      // its id, origin and review. Only what is new or different becomes theirs.
      const before = record.fields.filter((v) => v.fieldId === fieldId && v.value !== null);
      const same = (v: FieldValue, input: FieldValueInput) =>
        v.value === input.value && JSON.stringify(v.spans) === JSON.stringify(input.spans);
      const replacement = ctx
        .valuesFor(field, values)
        .map((created, i) => (values[i] && before.find((v) => same(v, values[i]))) || created);
      const at = record.fields.findIndex((v) => v.fieldId === fieldId);
      record.fields = record.fields.filter((v) => v.fieldId !== fieldId);
      record.fields.splice(at === -1 ? record.fields.length : at, 0, ...replacement);
    });
  }

  async setValueReview(
    runId: string,
    fileId: string,
    recordId: string,
    valueId: string,
    review: ReviewState,
    revision: number,
  ): Promise<FileExtraction> {
    return this.change(runId, fileId, revision, false, (ctx) => {
      const value = ctx.record(recordId).fields.find((v) => v.id === valueId);
      if (!value) {
        throw new ApiError({
          status: 404,
          code: "value_not_found",
          message: "This value no longer exists.",
        });
      }
      value.review = review;
    });
  }

  /** For tests and the console: how many example records the last extraction run of this run was given. */
  lastExamplesUsed(runId: string): number {
    return this.examplesUsed.get(runId) ?? 0;
  }

  async getAssistantMessages(runId: string, signal?: AbortSignal): Promise<AssistantMessage[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    return structuredClone(this.requireRun(runId).assistant ?? []);
  }

  async sendAssistantMessage(
    runId: string,
    text: string,
    definition: ExtractionDefinitionDraft,
  ): Promise<AssistantMessage> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    if (!text.trim()) {
      throw new ApiError({
        status: 422,
        code: "empty_message",
        message: "Write a message first.",
      });
    }
    const messages = (run.assistant ??= []);
    if (messages.some((m) => m.status === "streaming")) {
      throw new ApiError({
        status: 409,
        code: "assistant_busy",
        message: "The assistant is still answering.",
      });
    }
    const userMessage: AssistantMessage = {
      id: newId(),
      role: "user",
      text: text.trim(),
      proposal: null,
      status: "done",
      createdAt: this.timestamp(),
    };
    const reply: AssistantMessage = {
      id: newId(),
      role: "assistant",
      text: "",
      proposal: null,
      status: "streaming",
      createdAt: this.timestamp(),
    };
    messages.push(userMessage, reply);
    this.save();
    void this.streamReply(run, reply, text, structuredClone(definition));
    return structuredClone(userMessage);
  }

  async clearAssistantMessages(runId: string): Promise<void> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    if (run.assistant?.some((m) => m.status === "streaming")) {
      throw new ApiError({
        status: 409,
        code: "assistant_busy",
        message: "The assistant is still answering.",
      });
    }
    run.assistant = [];
    this.save();
    this.notifyRun(run, (handlers) => handlers.onAssistantCleared?.());
  }

  async publishDefinition(runId: string): Promise<PublishResult> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    if (this.ensureDefinition(run).recordTypes.length === 0) {
      throw new ApiError({
        status: 422,
        code: "nothing_to_publish",
        message: "Save a definition with at least one record type first.",
      });
    }
    run.publishedVersion = (run.publishedVersion ?? 0) + 1;
    this.save();
    return { pipelineConfigVersion: run.publishedVersion, examples: this.countExamples(run) };
  }

  async deleteRun(runId: string): Promise<void> {
    await this.wait(LATENCY_MS);
    if (this.runs.get(runId)?.workspaceId) {
      throw new ApiError({
        status: 409,
        code: "run_belongs_to_workspace",
        message: "This run belongs to a workspace. Delete the workspace instead.",
      });
    }
    this.runs.delete(runId);
    this.save();
  }

  /**
   * Forgets every run and its saved copy, for when another person signs in.
   * Work still queued stops by itself, because its run is gone. Live
   * subscriptions are detached, so nothing more reaches them.
   */
  reset(): void {
    this.runs.clear();
    this.workspaces.clear();
    this.subscriptions.clear();
    this.examplesUsed.clear();
    try {
      this.storage?.removeItem?.(this.storageKey);
      this.persistentStorage?.removeItem?.(this.persistentStorageKey);
    } catch {
      // Storage blocked: nothing was saved there that we could remove.
    }
  }

  // ── Events ────────────────────────────────────────────────────────────

  subscribe(runId: string, handlers: RunEventHandlers): () => void {
    const subscription: Subscription = { runId, handlers, open: false };
    this.subscriptions.add(subscription);
    handlers.onStateChange?.("connecting");
    void this.wait(LATENCY_MS).then(() => {
      if (!this.subscriptions.has(subscription) || !this.connected) return;
      this.openSubscription(subscription);
    });
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  // ── Controls for trying things out (see window.__mockBackend) ─────────

  /** Drop the live connection for `ms`. Cells sent meanwhile are lost, as on a real socket. */
  dropConnection(ms = 5_000): void {
    this.connected = false;
    for (const subscription of this.subscriptions) {
      subscription.open = false;
      subscription.handlers.onStateChange?.("reconnecting");
    }
    setTimeout(() => {
      this.connected = true;
      for (const subscription of this.subscriptions) this.openSubscription(subscription);
    }, ms);
  }

  /** Make the next execution of `stage` fail for its first file. */
  failNext(stage: WorkStageId): void {
    this.failNextStages.add(stage);
  }

  /** Make the next extraction leave its first quote value unanchored (not found in the text). */
  unanchorNext(): void {
    this.unanchorNextExtraction = true;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private openSubscription(subscription: Subscription) {
    subscription.open = true;
    const state: ConnectionState = "open";
    subscription.handlers.onStateChange?.(state);
    subscription.handlers.onOpen?.();
  }

  private async work(
    runId: string,
    fileId: string,
    stage: WorkStageId,
    executionId: string,
    index: number,
    fail: boolean,
    unanchor = false,
  ) {
    const current = () => {
      const run = this.runs.get(runId);
      const cell = run?.cells[key(fileId, stage)];
      return run && cell && cell.executionId === executionId && isActive(cell) ? run : null;
    };

    await this.wait(100 + index * QUEUE_STAGGER_MS);
    let run = current();
    if (!run) return; // superseded or deleted while queued
    const file = run.files.find((f) => f.id === fileId)!;
    this.update(run, fileId, stage, { status: "running", progress: stage === "ingest" ? 0 : null });

    if (stage === "ingest") {
      // Bigger files take a little longer, capped so the demo stays quick.
      const stepMs = Math.min(80 + file.sizeBytes / 40_000, 300);
      for (let step = 1; step <= INGEST_STEPS; step++) {
        await this.wait(stepMs);
        if (!(run = current())) return;
        if (fail && step === 4) break;
        this.update(run, fileId, stage, { progress: Math.round((step / INGEST_STEPS) * 100) });
      }
    } else {
      await this.wait(WORK_MS[stage]);
      if (!(run = current())) return;
    }

    if (fail) {
      this.update(run, fileId, stage, {
        status: "failed",
        progress: null,
        error: { code: "mock_failure", message: "The mock was asked to fail this file." },
      });
      return;
    }
    if (stage === "classify" || stage === "enrich") {
      (run.sharedWriter ??= {})[fileId] = stage; // saved by the update below
    }
    let extractionRevision: number | null = null;
    if (stage === "extract") extractionRevision = this.extract(run, file, unanchor);
    this.update(run, fileId, stage, {
      status: "succeeded",
      progress: stage === "ingest" ? 100 : null,
      output: outputMeta(file, stage, executionId),
    });
    if (extractionRevision !== null) {
      this.notifyExtraction(run, { fileId, revision: extractionRevision });
    }
  }

  /**
   * The text extraction works on for a file and its version, or null when there
   * is none yet. The one place that says where that text comes from: the copy
   * classify and enrich share, as getOutput(…, "enrich") returns it, or, for
   * Knowledge Studio, the stored document the run file points at.
   */
  private extractionInput(run: MockRun, fileId: string): { text: string; etag: string } | null {
    const file = run.files.find((f) => f.id === fileId);
    if (run.extractionInput === "document") {
      const text = file && mockDocumentText(file.sourceRef);
      const etag = file && MOCK_DOCUMENTS.find((d) => d.id === file.sourceRef)?.etag;
      return text !== undefined && text !== null && etag ? { text, etag } : null;
    }
    const etag = run.cells[key(fileId, "enrich")]?.output?.etag;
    if (!file || !etag) return null;
    return { text: outputText(file, run.sharedWriter?.[fileId] ?? "enrich"), etag };
  }

  /** Runs the extractor on the extraction input and stores the result. Returns the new revision. */
  private extract(run: MockRun, file: RunFile, unanchor: boolean): number {
    const definition = this.ensureDefinition(run);
    const input = this.extractionInput(run, file.id);
    if (!input) {
      throw new ApiError({
        status: 422,
        code: "upstream_not_ready",
        message: "The file has no text to extract from yet.",
      });
    }
    const text = input.text;
    const previous = run.extractions?.[file.id];
    // Learning: the real service sends these records, passage and expected output
    // together, to the model as examples. The mock only counts them.
    this.examplesUsed.set(run.id, this.countExamples(run));
    // What a person did to the earlier records is kept; the rest is replaced.
    const records = mergeExtractedRecords(
      previous?.records ?? [],
      extractRecords(text, definition, {
        fileId: file.id,
        newId,
        unanchorFirst: unanchor,
      }),
    );
    const revision = (previous?.revision ?? 0) + 1;
    (run.extractions ??= {})[file.id] = {
      fileId: file.id,
      revision,
      sourceEtag: input.etag,
      definitionVersion: definition.version,
      records,
    };
    return revision;
  }

  /**
   * Applies one change a person made to a file's records. Works on a copy, so a
   * rejected change leaves nothing behind; on success it raises the revision,
   * saves, and tells subscribers like a finished run does.
   */
  private async change(
    runId: string,
    fileId: string,
    revision: number,
    creates: boolean,
    apply: (ctx: ChangeContext) => void,
  ): Promise<FileExtraction> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    const file = run.files.find((f) => f.id === fileId);
    if (!file) {
      throw new ApiError({
        status: 422,
        code: "unknown_file",
        message: "This file is not part of this run.",
      });
    }
    const definition = this.ensureDefinition(run);
    let extraction = run.extractions?.[fileId];
    if (!extraction) {
      if (!creates) {
        throw new ApiError({
          status: 404,
          code: "extraction_not_found",
          message: "This file has not been extracted yet.",
        });
      }
      const input = this.extractionInput(run, fileId);
      if (!input) {
        throw new ApiError({
          status: 422,
          code: "upstream_not_ready",
          message: "The file has no text to extract from yet.",
        });
      }
      extraction = {
        fileId,
        revision: 0,
        sourceEtag: input.etag,
        definitionVersion: definition.version || 0,
        records: [],
      };
    }
    if (revision !== extraction.revision) {
      throw new ApiError({
        status: 409,
        code: "revision_conflict",
        message: "The records changed since they were loaded.",
        details: { revision: extraction.revision },
      });
    }

    const next = structuredClone(extraction);
    const text = this.extractionInput(run, fileId)?.text ?? "";
    apply({
      extraction: next,
      definition,
      record: (id) => {
        const found = next.records.find((r) => r.id === id);
        if (!found) {
          throw new ApiError({
            status: 404,
            code: "record_not_found",
            message: "This record no longer exists.",
          });
        }
        return found;
      },
      checkSpan: (span) => checkSpan(text, span),
      valuesFor: (field, inputs) => {
        if (!field.multiple && inputs.length > 1) {
          throw new ApiError({
            status: 422,
            code: "too_many_values",
            message: `"${field.name}" takes a single value.`,
          });
        }
        inputs.forEach((input) => input.spans.forEach((span) => checkSpan(text, span)));
        return (inputs.length > 0 ? inputs : [{ value: null, spans: [] }]).map((input) => ({
          id: `val_${newId()}`,
          fieldId: field.id,
          value: input.value,
          spans: input.spans.map((span) => ({ ...span })),
          origin: "human" as const,
          review: "accepted" as const,
          anchored: true,
        }));
      },
    });
    next.revision = extraction.revision + 1;
    (run.extractions ??= {})[fileId] = next;
    run.activityAt = this.timestamp();
    this.save();
    this.notifyExtraction(run, { fileId, revision: next.revision });
    return structuredClone(next);
  }

  private countExamples(run: MockRun): number {
    return Object.values(run.extractions ?? {})
      .flatMap((e) => e.records)
      .filter((r) => r.useAsExample && r.review === "accepted").length;
  }

  private ensureDefinition(run: MockRun): ExtractionDefinition {
    if (!run.definition) {
      run.definition = {
        ...structuredClone(DEFAULT_EXTRACTION_DEFINITION),
        version: 1,
        note: "",
        createdAt: this.timestamp(),
      };
      this.save();
    }
    // Runs saved before versions had notes, or chunking.
    run.definition.note ??= "";
    run.definition.chunking ??= { strategy: "auto", size: null };
    run.definition.createdAt ??= run.createdAt;
    return run.definition;
  }

  /** Makes `draft` the newest version of the run's definition. */
  private pushDefinition(
    run: MockRun,
    draft: ExtractionDefinitionDraft,
    version: number,
    note: string,
  ): ExtractionDefinition {
    const current = this.ensureDefinition(run);
    (run.previousDefinitions ??= []).push(current);
    run.definition = {
      prompt: draft.prompt,
      recordTypes: structuredClone(draft.recordTypes),
      output: structuredClone(draft.output),
      // A save without the key keeps the saved setting, like the server (older clients).
      chunking: normalChunking(draft.chunking ?? current.chunking),
      version,
      note,
      createdAt: this.timestamp(),
    };
    this.save();
    return structuredClone(run.definition);
  }

  /** Every saved version, oldest first. */
  private allDefinitions(run: MockRun): ExtractionDefinition[] {
    const current = this.ensureDefinition(run);
    return [...(run.previousDefinitions ?? []), current].map((d) => ({
      ...d,
      note: d.note ?? "",
      chunking: d.chunking ?? { strategy: "auto", size: null },
      createdAt: d.createdAt ?? run.createdAt,
    }));
  }

  private requireVersion(run: MockRun, version: number): ExtractionDefinition {
    const found = this.allDefinitions(run).find((d) => d.version === version);
    if (!found) {
      throw new ApiError({
        status: 404,
        code: "definition_version_not_found",
        message: "This version of the configuration does not exist.",
      });
    }
    return found;
  }

  /** Writes the reply in a few chunks, keeping the stored message in step with what is sent. */
  private async streamReply(
    run: MockRun,
    message: AssistantMessage,
    text: string,
    definition: ExtractionDefinitionDraft,
  ) {
    const { text: replyText, proposal } = assistantReply(text, definition, { newId });
    const chunks = replyText.match(/\S+\s*/g) ?? [];
    const size = Math.max(1, Math.ceil(chunks.length / 4));
    const emit = (event: AssistantEvent) => {
      for (const subscription of this.subscriptions) {
        if (subscription.open && subscription.runId === run.id) {
          subscription.handlers.onAssistantEvent?.(structuredClone(event));
        }
      }
    };
    const alive = () => this.runs.get(run.id) === run;

    for (let i = 0; i < chunks.length; i += size) {
      await this.wait(60);
      if (!alive()) return;
      const delta = chunks.slice(i, i + size).join("");
      message.text += delta;
      this.save();
      emit({ type: "delta", messageId: message.id, text: delta });
    }
    if (proposal) {
      await this.wait(60);
      if (!alive()) return;
      message.proposal = proposal;
      this.save();
      emit({ type: "proposal", messageId: message.id, proposal });
    }
    await this.wait(30);
    if (!alive()) return;
    message.status = "done";
    this.save();
    emit({ type: "done", messageId: message.id });
  }

  private notifyExtraction(run: MockRun, change: ExtractionChange) {
    for (const subscription of this.subscriptions) {
      if (subscription.open && subscription.runId === run.id) {
        subscription.handlers.onExtractionChanged?.({ ...change });
      }
    }
  }

  private update(run: MockRun, fileId: string, stage: WorkStageId, patch: Partial<StageCell>) {
    const cell: StageCell = {
      ...run.cells[key(fileId, stage)],
      ...patch,
      updatedAt: this.timestamp(),
    };
    run.cells[key(fileId, stage)] = cell;
    this.save();
    for (const subscription of this.subscriptions) {
      if (subscription.open && subscription.runId === run.id) {
        subscription.handlers.onCell({ ...cell });
      }
    }
  }

  /** Calls `send` for every open subscription on the run. */
  private notifyRun(run: MockRun, send: (handlers: RunEventHandlers) => void) {
    for (const subscription of this.subscriptions) {
      if (subscription.open && subscription.runId === run.id) send(subscription.handlers);
    }
  }

  private requireWorkspace(workspaceId: string): MockWorkspace {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new ApiError({
        status: 404,
        code: "workspace_not_found",
        message: "This workspace does not exist.",
      });
    }
    return workspace;
  }

  private workspaceView(workspace: MockWorkspace): Workspace {
    const run = this.runs.get(workspace.runId);
    const times = [workspace.updatedAt, run?.activityAt ?? ""];
    if (run) {
      times.push(...Object.values(run.cells).map((c) => c.updatedAt));
      times.push(...(run.assistant ?? []).map((m) => m.createdAt));
      if (run.definition) times.push(...this.allDefinitions(run).map((d) => d.createdAt));
    }
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      runId: workspace.runId,
      documentCount: run?.files.length ?? 0,
      configurationVersion: run?.definition?.version ?? null,
      createdAt: workspace.createdAt,
      updatedAt: times.reduce((a, b) => (b > a ? b : a)),
    };
  }

  private requireRun(runId: string): MockRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new ApiError({
        status: 404,
        code: "run_not_found",
        message: "This run no longer exists.",
      });
    }
    return run;
  }

  private snapshot(run: MockRun): Run {
    return {
      id: run.id,
      createdAt: run.createdAt,
      files: run.files.map((f) => ({ ...f })),
      cells: Object.values(run.cells).map((c) => ({ ...c })),
    };
  }

  /** Strictly increasing, so two changes in the same millisecond still have an order. */
  private timestamp(): string {
    this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    return new Date(this.lastTimestamp).toISOString();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms * this.speed));
  }

  private save() {
    const runs = [...this.runs.values()];
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(runs.filter((r) => !r.workspaceId)));
    } catch {
      // Storage full or blocked: the mock still works until the next reload.
    }
    try {
      const owned = runs.filter((r) => r.workspaceId);
      if (this.workspaces.size === 0 && owned.length === 0) {
        this.persistentStorage?.removeItem?.(this.persistentStorageKey);
      } else {
        this.persistentStorage?.setItem(
          this.persistentStorageKey,
          JSON.stringify({ workspaces: [...this.workspaces.values()], runs: owned }),
        );
      }
    } catch {
      // Same: kept in memory until the next reload.
    }
  }

  /** Load runs from before a reload and pick up the work that was in flight. */
  private restore() {
    let saved: MockRun[] = [];
    try {
      saved = JSON.parse(this.storage?.getItem(this.storageKey) ?? "[]") as MockRun[];
    } catch {
      // Nothing usable in this tab's storage.
    }
    try {
      const stored = JSON.parse(this.persistentStorage?.getItem(this.persistentStorageKey) ?? "{}");
      for (const workspace of (stored.workspaces ?? []) as MockWorkspace[]) {
        this.workspaces.set(workspace.id, workspace);
      }
      saved = [...saved, ...((stored.runs ?? []) as MockRun[])];
    } catch {
      // Nothing usable in the persistent storage.
    }
    for (const run of saved) {
      this.runs.set(run.id, run);
      // A reply cut off by the reload is not coming back: keep what was written.
      for (const message of run.assistant ?? []) message.status = "done";
      const perExecution = new Map<string, number>();
      for (const cell of Object.values(run.cells)) {
        if (!isActive(cell) || !cell.executionId) continue;
        const index = perExecution.get(cell.executionId) ?? 0;
        perExecution.set(cell.executionId, index + 1);
        void this.work(run.id, cell.fileId, cell.stage, cell.executionId, index, false);
      }
    }
  }
}
