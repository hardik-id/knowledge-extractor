import { isApiError } from "@/lib/api/api-error";
import { spanFromRange } from "@/lib/text-spans";
import type {
  AssistantEvent,
  ExtractionChange,
  ExtractionDefinition,
  ExtractionDefinitionDraft,
  ExtractionRecord,
  FieldDef,
  FileExtraction,
  Services,
  StageCell,
  TextSpan,
} from "../contracts";

/**
 * The Knowledge Studio flow, end to end, through the service contract and
 * nothing else: the same calls the Studio app makes, in the order a person
 * makes them. `npm run test:api` runs it with `createHttpServices` against a
 * running backend (see `test-api.ts`), so every answer goes through the real
 * parsers. Each step checks what came back and stops the flow at the first
 * one that fails.
 */

export interface StudioFlowOptions {
  /** One line per step, as it finishes. */
  log: (line: string) => void;
  /** How long to wait for a live event. Default 60 seconds. */
  eventTimeoutMs?: number;
}

/** A step that failed: its number and name, and why. */
export class StudioFlowError extends Error {
  readonly step: string;

  constructor(step: string, cause: unknown) {
    super(`${step}: ${describeFailure(cause)}`, { cause });
    this.name = "StudioFlowError";
    this.step = step;
  }
}

/** What went wrong, in words, with the server's answer when there was one. */
export function describeFailure(error: unknown): string {
  if (isApiError(error)) {
    const status = error.status === 0 ? "no HTTP status" : `HTTP ${error.status}`;
    const lines = [`${status} ${error.code}: ${error.message}`];
    if (error.details !== undefined) lines.push(`details: ${JSON.stringify(error.details)}`);
    if (error.requestId) lines.push(`request id: ${error.requestId}`);
    if (error.cause instanceof Error) lines.push(`cause: ${error.cause.message}`);
    return lines.join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type LiveEvent =
  | { kind: "open" }
  | { kind: "cell"; cell: StageCell }
  | { kind: "extraction"; change: ExtractionChange }
  | { kind: "assistant"; event: AssistantEvent };

/** Live events as they arrive, and a way to wait for one. */
function liveEvents(timeoutMs: number) {
  const seen: LiveEvent[] = [];
  const waiters = new Set<() => void>();
  const push = (event: LiveEvent) => {
    seen.push(event);
    for (const wake of [...waiters]) wake();
  };
  /** Resolves with the first event (already seen or still to come) that `match` accepts. */
  const waitFor = <T>(what: string, match: (event: LiveEvent) => T | undefined): Promise<T> =>
    new Promise((resolve, reject) => {
      const look = () => {
        for (const event of seen) {
          const found = match(event);
          if (found !== undefined) {
            done();
            resolve(found);
            return;
          }
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`No ${what} within ${timeoutMs / 1000} s.`));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        waiters.delete(look);
      };
      waiters.add(look);
      look();
    });
  return { seen, push, waitFor };
}

const draftOf = ({
  prompt,
  recordTypes,
  output,
}: ExtractionDefinition): ExtractionDefinitionDraft =>
  structuredClone({ prompt, recordTypes, output });

/** The first Markdown heading of the text: the whole line and its words, as spans. */
function headingSpans(text: string): { line: TextSpan; words: TextSpan } | null {
  const match = /^#{1,6}[ \t]+(\S.*?)[ \t]*$/m.exec(text);
  if (!match) return null;
  const lineStart = match.index;
  const wordsStart = lineStart + match[0].indexOf(match[1]);
  return {
    line: spanFromRange(text, lineStart, lineStart + match[0].length),
    words: spanFromRange(text, wordsStart, wordsStart + match[1].length),
  };
}

const recordIn = (extraction: FileExtraction, id: string): ExtractionRecord | undefined =>
  extraction.records.find((r) => r.id === id);

export async function runStudioFlow(services: Services, options: StudioFlowOptions): Promise<void> {
  const { log } = options;
  const events = liveEvents(options.eventTimeoutMs ?? 60_000);
  let stepNumber = 0;

  /** Runs one step; a failure stops the flow with the step's name and the server's answer. */
  const step = async <T>(name: string, run: () => Promise<[T, string]>): Promise<T> => {
    const label = `${String(++stepNumber).padStart(2)}. ${name}`;
    try {
      const [result, detail] = await run();
      log(`${label.padEnd(46, " ")} ok   ${detail}`);
      return result;
    } catch (error) {
      log(`${label.padEnd(46, " ")} FAILED`);
      throw new StudioFlowError(label.trim(), error);
    }
  };

  // The live-update handler logs what it can't read and goes on; here that is a failure.
  const ignored: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("Ignored a live update")) {
      ignored.push(args[1]);
      return;
    }
    warn(...args);
  };

  /** What to clean up if a step fails half way. */
  const open: { runId: string | null; unsubscribe: (() => void) | null } = {
    runId: null,
    unsubscribe: null,
  };
  const checkLiveUpdates = () => {
    if (ignored.length > 0) {
      throw new Error(
        `The app ignored ${ignored.length} live update(s) it couldn't read: ${describeFailure(ignored[0])}`,
      );
    }
  };

  try {
    const documents = await step("List documents", async () => {
      const listed = await services.catalog.list("storage", "");
      check(listed.length > 0, "The backend listed no documents.");
      check(
        listed.every((d) => d.source === "storage" && d.etag),
        "A listed document is not a storage document with an ETag.",
      );
      return [listed, `${listed.length} document(s)`];
    });

    const first = await step("Read a document (ETag)", async () => {
      const document = documents[0];
      const read = await services.documents.get(document.id);
      check(read.text.length > 0, "The document is empty.");
      check(
        read.etag === document.etag,
        `The ETag read (${read.etag}) is not the one listed (${document.etag}).`,
      );
      return [
        { id: document.id, text: read.text },
        `${document.id}: ${[...read.text].length} characters, ETag ${read.etag}`,
      ];
    });

    const run = await step("Create a run", async () => {
      const created = await services.runs.createRun(documents);
      check(
        created.files.length === documents.length,
        `The run has ${created.files.length} files, not ${documents.length}.`,
      );
      check(
        created.files.every((f, i) => f.sourceRef === documents[i].id),
        "The run's files are not the documents sent, in order.",
      );
      check(
        created.files.every((f) =>
          created.cells.some((c) => c.fileId === f.id && c.stage === "extract"),
        ),
        "A file of the run has no extract cell.",
      );
      check(
        created.cells.every((c) => c.stage === "extract"),
        "A run of documents has a stage other than extract.",
      );
      open.runId = created.id;
      return [created, `run ${created.id}, ${created.files.length} file(s), extract cells only`];
    });
    const fileIds = run.files.map((f) => f.id);

    await step("Subscribe to the run's events", async () => {
      open.unsubscribe = services.events.subscribe(run.id, {
        onOpen: () => events.push({ kind: "open" }),
        onCell: (cell) => events.push({ kind: "cell", cell }),
        onExtractionChanged: (change) => events.push({ kind: "extraction", change }),
        onAssistantEvent: (event) => events.push({ kind: "assistant", event }),
      });
      await events.waitFor("open socket", (e) => (e.kind === "open" ? true : undefined));
      return [null, "ticket taken, socket open"];
    });

    const definition = await step("Read the definition", async () => {
      const read = await services.extraction.getDefinition(run.id);
      check(read.recordTypes.length > 0, "The definition has no record types.");
      return [read, `version ${read.version}, ${read.recordTypes.length} record type(s)`];
    });

    const saved = await step("Save the definition", async () => {
      const draft = draftOf(definition);
      draft.prompt = `${draft.prompt.trim()} (checked by test:api)`;
      const next = await services.extraction.saveDefinition(run.id, draft, definition.version);
      check(
        next.version === definition.version + 1,
        `The saved version is ${next.version}, not ${definition.version + 1}.`,
      );
      check(next.prompt === draft.prompt, "The saved prompt is not the one sent.");
      return [next, `version ${next.version}`];
    });

    await step("Send an assistant message", async () => {
      const sent = await services.extraction.sendAssistantMessage(
        run.id,
        "Add a field for the owner",
        draftOf(saved),
      );
      check(sent.role === "user", `The stored message's role is ${sent.role}, not user.`);
      return [sent, `message ${sent.id}`];
    });

    await step("Receive the reply (delta, proposal, done)", async () => {
      const replyId = await events.waitFor("assistant.done", (e) =>
        e.kind === "assistant" && e.event.type === "done" ? e.event.messageId : undefined,
      );
      const parts = events.seen.flatMap((e) =>
        e.kind === "assistant" && e.event.messageId === replyId ? [e.event] : [],
      );
      const deltas = parts.filter((p) => p.type === "delta");
      const proposals = parts.filter((p) => p.type === "proposal");
      check(deltas.length > 0, "The reply had no assistant.delta.");
      check(proposals.length === 1, `The reply had ${proposals.length} proposals, not 1.`);
      const messages = await services.extraction.getAssistantMessages(run.id);
      const reply = messages.find((m) => m.id === replyId);
      check(reply, `The conversation has no message ${replyId}.`);
      check(reply.role === "assistant" && reply.status === "done", "The reply is not done.");
      check(reply.proposal, "The stored reply has no proposal.");
      return [
        null,
        `${deltas.length} delta(s), 1 proposal, done; ${messages.length} message(s) stored`,
      ];
    });

    await step("Execute extract", async () => {
      const execution = await services.runs.executeStage(run.id, "extract", {
        fileIds,
        config: { definitionVersion: saved.version },
      });
      check(execution.stage === "extract", `The execution's stage is ${execution.stage}.`);
      check(
        [...execution.fileIds].sort().join() === [...fileIds].sort().join(),
        "The execution is not for the run's files.",
      );
      return [execution, `execution ${execution.id}, definition version ${saved.version}`];
    });

    const changes = await step("Receive cells and extraction.changed", async () => {
      const finished = await Promise.all(
        fileIds.map((fileId) =>
          events.waitFor(`finished extract cell for file ${fileId}`, (e) =>
            e.kind === "cell" &&
            e.cell.fileId === fileId &&
            e.cell.stage === "extract" &&
            (e.cell.status === "succeeded" || e.cell.status === "failed")
              ? e.cell
              : undefined,
          ),
        ),
      );
      const failed = finished.find((c) => c.status !== "succeeded");
      check(
        !failed,
        `Extraction failed for file ${failed?.fileId}: ${failed?.error?.code}: ${failed?.error?.message}`,
      );
      const changed = await Promise.all(
        fileIds.map((fileId) =>
          events.waitFor(`extraction.changed for file ${fileId}`, (e) =>
            e.kind === "extraction" && e.change.fileId === fileId ? e.change : undefined,
          ),
        ),
      );
      const statuses = events.seen.flatMap((e) =>
        e.kind === "cell" && e.cell.fileId === fileIds[0] ? [e.cell.status] : [],
      );
      return [
        changed,
        `${statuses.join(" > ")} for each file; ${changed.length} extraction.changed`,
      ];
    });

    await step("Read the snapshot", async () => {
      const snapshot = await services.runs.getRun(run.id);
      const extractCells = snapshot.cells.filter((c) => c.stage === "extract");
      check(
        extractCells.length === fileIds.length &&
          extractCells.every((c) => c.status === "succeeded"),
        "Not every extract cell in the snapshot has succeeded.",
      );
      return [snapshot, `${extractCells.length} extract cell(s) succeeded`];
    });

    const extractions = await step("Read the records", async () => {
      const read = await Promise.all(
        run.files.map((f) => services.extraction.getFileExtraction(run.id, f.id)),
      );
      for (const [i, extraction] of read.entries()) {
        const f = run.files[i];
        const listed = documents.find((d) => d.id === f.sourceRef);
        check(extraction.fileId === f.id, `The records of ${f.id} are for ${extraction.fileId}.`);
        check(
          extraction.revision >= (changes.find((c) => c.fileId === f.id)?.revision ?? 0),
          `The revision of ${f.id} is older than its extraction.changed.`,
        );
        check(
          extraction.sourceEtag === listed?.etag,
          `source_etag ${extraction.sourceEtag} of ${f.sourceRef} is not its ETag ${listed?.etag}.`,
        );
        check(
          extraction.definitionVersion === saved.version,
          `definition_version ${extraction.definitionVersion} is not ${saved.version}.`,
        );
      }
      const total = read.reduce((n, e) => n + e.records.length, 0);
      return [read, `${total} record(s) in ${read.length} file(s)`];
    });

    // The five corrections, on the file with the most records, as the Review tab makes them.
    let extraction = extractions.reduce((a, b) => (b.records.length > a.records.length ? b : a));
    const file = run.files.find((f) => f.id === extraction.fileId)!;
    const recordType = saved.recordTypes[0];
    const quoteField: FieldDef | undefined = recordType.fields.find(
      (f) => f.mode === "quote" && f.valueType === "text",
    );
    let recordId = "";
    let heading: ReturnType<typeof headingSpans> = null;

    extraction = await step("Add a record", async () => {
      const text =
        file.sourceRef === first.id
          ? first.text
          : (await services.documents.get(file.sourceRef)).text;
      heading = headingSpans(text);
      check(heading, `${file.sourceRef} has no Markdown heading to mark.`);
      const next = await services.extraction.addRecord(
        run.id,
        file.id,
        {
          recordTypeId: recordType.id,
          span: heading.line,
          fields: quoteField
            ? [
                {
                  fieldId: quoteField.id,
                  values: [{ value: heading.words.quote, spans: [heading.words] }],
                },
              ]
            : [],
        },
        extraction.revision,
      );
      const added = next.records.find(
        (r) => r.origin === "human" && !extraction.records.some((old) => old.id === r.id),
      );
      check(added, "The new record is not in the answer.");
      check(added.review === "accepted", `The new record is ${added.review}, not accepted.`);
      check(next.revision > extraction.revision, "The revision did not go up.");
      recordId = added.id;
      return [
        next,
        `${recordType.name} on ${file.sourceRef}: record ${added.id}, revision ${next.revision}`,
      ];
    });

    extraction = await step("Set a field's values", async () => {
      const field = quoteField ?? recordType.fields[0];
      check(field, `Record type ${recordType.name} has no fields.`);
      const line = heading?.line;
      const values = field === quoteField && line ? [{ value: line.quote, spans: [line] }] : [];
      const next = await services.extraction.setFieldValues(
        run.id,
        file.id,
        recordId,
        field.id,
        values,
        extraction.revision,
      );
      const record = recordIn(next, recordId);
      check(record, "The record is gone.");
      const got = record.fields.filter((v) => v.fieldId === field.id);
      check(got.length > 0, `Field ${field.key} has no value.`);
      check(
        got[0].value === (values[0]?.value ?? null),
        `Field ${field.key} is ${JSON.stringify(got[0].value)}.`,
      );
      return [next, `${field.key} = ${JSON.stringify(got[0].value)}, revision ${next.revision}`];
    });

    extraction = await step("Review a value", async () => {
      // A value the model suggested when there is one; else the one written above.
      const record =
        extraction.records.find(
          (r) => r.origin === "llm" && r.fields.some((v) => v.review === "suggested"),
        ) ?? recordIn(extraction, recordId);
      const value =
        record?.fields.find((v) => v.review === "suggested" && v.value !== null) ??
        record?.fields.find((v) => v.review === "suggested") ??
        record?.fields[0];
      check(record && value, "There is no value to review.");
      const next = await services.extraction.setValueReview(
        run.id,
        file.id,
        record.id,
        value.id,
        "rejected",
        extraction.revision,
      );
      const after = recordIn(next, record.id)?.fields.find((v) => v.id === value.id);
      check(after?.review === "rejected", `The value is ${after?.review}, not rejected.`);
      return [
        next,
        `${value.origin} value ${JSON.stringify(value.value)} rejected, revision ${next.revision}`,
      ];
    });

    extraction = await step("Change a record", async () => {
      const next = await services.extraction.updateRecord(
        run.id,
        file.id,
        recordId,
        { useAsExample: true },
        extraction.revision,
      );
      check(recordIn(next, recordId)?.useAsExample === true, "use_as_example did not change.");
      return [next, `use_as_example on, revision ${next.revision}`];
    });

    await step("Write on an old revision (conflict)", async () => {
      try {
        await services.extraction.updateRecord(
          run.id,
          file.id,
          recordId,
          { useAsExample: false },
          extraction.revision - 1,
        );
      } catch (error) {
        if (isApiError(error) && error.status === 409 && error.code === "revision_conflict") {
          return [null, "409 revision_conflict"];
        }
        throw error;
      }
      throw new Error("A write on an old revision was accepted; expected 409 revision_conflict.");
    });

    extraction = await step("Delete the record", async () => {
      const next = await services.extraction.deleteRecord(
        run.id,
        file.id,
        recordId,
        extraction.revision,
      );
      check(!recordIn(next, recordId), "The record is still there.");
      return [next, `revision ${next.revision}`];
    });

    await step("Delete the run", async () => {
      await services.runs.deleteRun(run.id);
      open.runId = null;
      try {
        await services.runs.getRun(run.id);
      } catch (error) {
        if (isApiError(error) && error.status === 404) return [null, `then 404 ${error.code}`];
        throw error;
      }
      throw new Error("The run can still be read after it was deleted.");
    });

    await step("Every live update was readable", async () => {
      checkLiveUpdates();
      return [null, `${events.seen.length} event(s)`];
    });
  } finally {
    open.unsubscribe?.();
    console.warn = warn;
    // Leave nothing behind when a step failed half way.
    if (open.runId) await services.runs.deleteRun(open.runId).catch(() => undefined);
  }
}
