import { ApiError } from "@/lib/api/api-error";
import { toMarkdownName } from "@/lib/format";
import { newId } from "@/lib/id";
import { codePointToIndex } from "@/lib/text-spans";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
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
  type DocumentContent,
  type ExecuteStageOptions,
  type ExtractionChange,
  type Execution,
  type ExtractionDefinition,
  type ExtractionDefinitionDraft,
  type ExtractionRecord,
  type FieldDef,
  type FieldValue,
  type FieldValueInput,
  type FileExtraction,
  type NewRecordInput,
  type PublishResult,
  type RecordPatch,
  type ReviewState,
  type TextSpan,
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
 * State is kept in sessionStorage so a page reload finds the run again, the
 * way it would on a real server.
 */

const DEFAULT_STORAGE_KEY = "knowledge-extractor:mock-backend";

const LATENCY_MS = 150;
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
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** The key the state is kept under. One per app, so two apps on one origin keep apart. */
  storageKey?: string;
}

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

function defaultStorage(): MockBackendOptions["storage"] {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked by the browser
  }
}

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

export class MockBackend {
  private readonly runs = new Map<string, MockRun>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly storage: MockBackendOptions["storage"];
  private readonly storageKey: string;
  private readonly failNextStages = new Set<WorkStageId>();
  private unanchorNextExtraction = false;
  private readonly examplesUsed = new Map<string, number>();
  private speed: number;
  private connected = true;
  private lastTimestamp = 0;

  constructor(options: MockBackendOptions = {}) {
    this.speed = options.speed ?? 1;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
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
  ): Promise<ExtractionDefinition> {
    await this.wait(LATENCY_MS);
    const run = this.requireRun(runId);
    const current = this.ensureDefinition(run);
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
    run.definition = { ...structuredClone(draft), version: current.version + 1 };
    this.save();
    return structuredClone(run.definition);
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
    this.runs.delete(runId);
    this.save();
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
      run.definition = { ...structuredClone(DEFAULT_EXTRACTION_DEFINITION), version: 1 };
      this.save();
    }
    return run.definition;
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
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify([...this.runs.values()]));
    } catch {
      // Storage full or blocked: the mock still works until the next reload.
    }
  }

  /** Load runs from before a reload and pick up the work that was in flight. */
  private restore() {
    let saved: MockRun[];
    try {
      saved = JSON.parse(this.storage?.getItem(this.storageKey) ?? "[]") as MockRun[];
    } catch {
      return;
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
