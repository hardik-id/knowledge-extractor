import { ApiError } from "@/lib/api/api-error";
import { toMarkdownName } from "@/lib/format";
import { newId } from "@/lib/id";
import { MOCK_FILES } from "@/mocks/files";
import { mockMarkdownFor } from "@/mocks/markdown";
import type { FileType, SourceFile, SourceKind } from "@/types/pipeline";
import {
  WORK_STAGE_IDS,
  type ConnectionState,
  type ExecuteStageOptions,
  type Execution,
  type Run,
  type RunEventHandlers,
  type RunFile,
  type StageCell,
  type StageOutputContent,
  type StageOutputMeta,
  type WorkStageId,
} from "../contracts";

/**
 * An in-browser stand-in for the Django API and its WebSocket. It follows the
 * same rules the real backend will: work is asynchronous, state is a cell per
 * file and stage, one execution per stage at a time, and running a stage again
 * makes the later stages stale.
 *
 * State is kept in sessionStorage so a page reload finds the run again, the
 * way it would on a real server.
 */

const STORAGE_KEY = "knowledge-extractor:mock-backend";

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
}

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

function outputText(file: RunFile, stage: WorkStageId): string {
  if (stage === "transform") return mockMarkdownFor(file);
  if (stage === "ingest") return `Original file: ${file.name}`;
  return JSON.stringify({ stage, file: file.name, note: "Example output from the mock." }, null, 2);
}

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
  return stage === "transform"
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

export class MockBackend {
  private readonly runs = new Map<string, MockRun>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly storage: MockBackendOptions["storage"];
  private readonly failNextStages = new Set<WorkStageId>();
  private speed: number;
  private connected = true;
  private lastTimestamp = 0;

  constructor(options: MockBackendOptions = {}) {
    this.speed = options.speed ?? 1;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.restore();
  }

  // ── Source catalog ────────────────────────────────────────────────────

  async listFiles(source: SourceKind, query: string, signal?: AbortSignal): Promise<SourceFile[]> {
    await this.wait(LATENCY_MS);
    signal?.throwIfAborted();
    const q = query.trim().toLowerCase();
    return MOCK_FILES.filter(
      (f) =>
        f.source === source &&
        (!q || f.name.toLowerCase().includes(q) || f.location.toLowerCase().includes(q)),
    );
  }

  // ── Runs ──────────────────────────────────────────────────────────────

  async createRun(files: SourceFile[]): Promise<Run> {
    await this.wait(LATENCY_MS);
    if (files.length === 0) {
      throw new ApiError({ status: 422, code: "no_files", message: "Select at least one file." });
    }

    const run: MockRun = {
      id: `run_${newId()}`,
      createdAt: this.timestamp(),
      files: files.map((file) => ({ ...file, id: `file_${newId()}`, sourceRef: file.id })),
      cells: {},
    };
    for (const file of run.files) {
      for (const stage of WORK_STAGE_IDS) {
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

    const stageAt = WORK_STAGE_IDS.indexOf(stage);
    const previous = WORK_STAGE_IDS[stageAt - 1];
    if (previous && fileIds.some((id) => run.cells[key(id, previous)].status !== "succeeded")) {
      throw new ApiError({
        status: 422,
        code: "upstream_not_ready",
        message: "The previous stage has not finished for every file.",
      });
    }

    // Work built on the old output of this stage is now out of date.
    for (const later of WORK_STAGE_IDS.slice(stageAt + 1)) {
      for (const id of fileIds) {
        if (run.cells[key(id, later)].status !== "pending") {
          this.update(run, id, later, { status: "stale", progress: null });
        }
      }
    }

    const execution: Execution = { id: `exec_${newId()}`, stage, fileIds };
    const fail = this.failNextStages.delete(stage);
    fileIds.forEach((id, index) => {
      this.update(run, id, stage, {
        status: "queued",
        executionId: execution.id,
        progress: null,
        error: null,
        output: null,
      });
      void this.work(run.id, id, stage, execution.id, index, fail && index === 0);
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
    return { text: outputText(file, stage), contentType: cell.output.contentType };
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
    this.update(run, fileId, stage, {
      status: "succeeded",
      progress: stage === "ingest" ? 100 : null,
      output: outputMeta(file, stage, executionId),
    });
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
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.runs.values()]));
    } catch {
      // Storage full or blocked: the mock still works until the next reload.
    }
  }

  /** Load runs from before a reload and pick up the work that was in flight. */
  private restore() {
    let saved: MockRun[];
    try {
      saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? "[]") as MockRun[];
    } catch {
      return;
    }
    for (const run of saved) {
      this.runs.set(run.id, run);
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
