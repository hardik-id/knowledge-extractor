import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import { MOCK_DOCUMENTS } from "@/mocks/documents";
import { MOCK_FILES } from "@/mocks/files";
import type {
  AssistantEvent,
  CellStatus,
  ExtractionChange,
  Run,
  StageCell,
  WorkStageId,
} from "../contracts";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import { MockBackend, type MockBackendOptions } from "./mock-backend";

/**
 * The mock has to follow the same rules as the real backend, or the UI is
 * built against behaviour that will not exist. These tests pin those rules.
 */

const FILES = MOCK_FILES.slice(0, 2);

const fastBackend = (storage: MockBackendOptions["storage"] = null) =>
  new MockBackend({ speed: 0, storage });

async function until(condition: () => boolean | Promise<boolean>, what: string) {
  for (let i = 0; i < 500; i++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Timed out waiting until ${what}`);
}

const statuses = (run: Run, stage: WorkStageId): CellStatus[] =>
  run.cells.filter((cell) => cell.stage === stage).map((cell) => cell.status);

async function runStage(backend: MockBackend, runId: string, stage: WorkStageId) {
  await backend.executeStage(runId, stage);
  await until(
    async () =>
      statuses(await backend.getRun(runId), stage).every((status) => status === "succeeded"),
    `${stage} has finished`,
  );
}

const rejectsWithCode = (promise: Promise<unknown>, code: string, status: number) =>
  assert.rejects(promise, (error) => {
    assert.ok(isApiError(error), "rejects with an ApiError");
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });

describe("MockBackend", () => {
  test("a new run has a pending cell for every file and stage, under its own file ids", async () => {
    const run = await fastBackend().createRun(FILES);

    assert.equal(run.files.length, 2);
    assert.equal(run.cells.length, 2 * 6);
    assert.ok(run.cells.every((cell) => cell.status === "pending"));
    assert.deepEqual(
      run.files.map((file) => file.sourceRef),
      FILES.map((file) => file.id),
    );
    assert.notEqual(run.files[0].id, FILES[0].id);
  });

  test("a stage that is running can't be started again (409)", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);

    await backend.executeStage(run.id, "ingest");
    await rejectsWithCode(backend.executeStage(run.id, "ingest"), "execution_in_progress", 409);
  });

  test("a stage can't run before the one before it has finished (422)", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);

    await rejectsWithCode(backend.executeStage(run.id, "transform"), "upstream_not_ready", 422);
  });

  test("running a stage again makes the later stages out of date", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    await runStage(backend, run.id, "ingest");
    await runStage(backend, run.id, "transform");

    await backend.executeStage(run.id, "ingest");
    const after = await backend.getRun(run.id);

    assert.deepEqual(statuses(after, "transform"), ["stale", "stale"]);
    assert.deepEqual(statuses(after, "classify"), ["pending", "pending"], "never ran: not stale");
  });

  test("an unknown run is a 404", async () => {
    await rejectsWithCode(fastBackend().getRun("run_missing"), "run_not_found", 404);
  });

  test("output is there once a file has succeeded, and not before", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    const fileId = run.files[0].id;
    await runStage(backend, run.id, "ingest");

    await rejectsWithCode(backend.getOutput(run.id, fileId, "transform"), "output_not_found", 404);
    await runStage(backend, run.id, "transform");

    const output = await backend.getOutput(run.id, fileId, "transform");
    assert.equal(output.contentType, "text/markdown");
    assert.ok(output.text.length > 0);
  });

  test("a failing file ends as failed with an error, the others succeed", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    backend.failNext("ingest");
    await backend.executeStage(run.id, "ingest");
    await until(
      async () =>
        statuses(await backend.getRun(run.id), "ingest").every(
          (s) => s !== "queued" && s !== "running",
        ),
      "ingest has settled",
    );

    const cells = (await backend.getRun(run.id)).cells.filter((cell) => cell.stage === "ingest");
    assert.deepEqual(
      cells.map((cell) => cell.status),
      ["failed", "succeeded"],
    );
    assert.equal(cells[0].error?.code, "mock_failure");
  });

  test("subscribers get every change, each newer than the last", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES.slice(0, 1));
    const received: StageCell[] = [];
    let opened = 0;
    const unsubscribe = backend.subscribe(run.id, {
      onCell: (cell) => received.push(cell),
      onOpen: () => opened++,
    });
    await until(() => opened === 1, "the subscription is open");

    await runStage(backend, run.id, "ingest");
    unsubscribe();

    assert.equal(received[0].status, "queued");
    assert.equal(received.at(-1)?.status, "succeeded");
    const times = received.map((cell) => Date.parse(cell.updatedAt));
    assert.deepEqual(
      times,
      [...times].sort((a, b) => a - b),
    );
    assert.equal(new Set(times).size, times.length, "no two changes share a timestamp");
  });

  test("changes during a dropped connection are lost, and reopening says so", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES.slice(0, 1));
    const received: StageCell[] = [];
    let opened = 0;
    backend.subscribe(run.id, { onCell: (cell) => received.push(cell), onOpen: () => opened++ });
    await until(() => opened === 1, "the subscription is open");

    backend.dropConnection(30);
    await runStage(backend, run.id, "ingest");
    assert.deepEqual(received, [], "nothing arrives while disconnected");

    await until(() => opened === 2, "the subscription has reopened");
    const snapshot = await backend.getRun(run.id);
    assert.deepEqual(
      statuses(snapshot, "ingest"),
      ["succeeded"],
      "the snapshot has what was missed",
    );
  });

  test("after a reload, the run is found again and unfinished work carries on", async () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
    const before = fastBackend(storage);
    const run = await before.createRun(FILES);
    await before.executeStage(run.id, "ingest");

    // A second backend on the same storage plays the page after a reload.
    const after = fastBackend(storage);
    await until(
      async () =>
        statuses(await after.getRun(run.id), "ingest").every((status) => status === "succeeded"),
      "the restored backend has finished the ingest",
    );
  });

  describe("classify and enrich share one Markdown file", () => {
    const FRONT_MATTER = /^---\n[\s\S]*?\n---\n\n/;
    const ENRICH_KEYS = ["summary:", "keywords:", "related_documents:"];

    async function prepared(backend: MockBackend) {
      const run = await backend.createRun(FILES.slice(0, 1));
      for (const stage of ["ingest", "transform", "classify"] as const) {
        await runStage(backend, run.id, stage);
      }
      return { run, fileId: run.files[0].id };
    }

    test("classify writes a Markdown copy with front matter, named like the transform output", async () => {
      const backend = fastBackend();
      const { run, fileId } = await prepared(backend);
      const cells = (await backend.getRun(run.id)).cells;
      const meta = (stage: string) =>
        cells.find((c) => c.fileId === fileId && c.stage === stage)!.output!;

      const classified = await backend.getOutput(run.id, fileId, "classify");
      const transformed = await backend.getOutput(run.id, fileId, "transform");
      assert.equal(classified.contentType, "text/markdown");
      assert.equal(meta("classify").name, meta("transform").name);
      assert.match(classified.text, FRONT_MATTER);
      assert.ok(classified.text.includes(transformed.text));
      for (const key of ENRICH_KEYS) assert.ok(!classified.text.includes(key));
    });

    test("after enrich, both stages return the same enriched text and transform is untouched", async () => {
      const backend = fastBackend();
      const { run, fileId } = await prepared(backend);
      const transformBefore = await backend.getOutput(run.id, fileId, "transform");
      await runStage(backend, run.id, "enrich");

      const classified = await backend.getOutput(run.id, fileId, "classify");
      const enriched = await backend.getOutput(run.id, fileId, "enrich");
      const transformed = await backend.getOutput(run.id, fileId, "transform");
      assert.equal(classified.text, enriched.text);
      for (const key of ENRICH_KEYS) assert.ok(enriched.text.includes(key));
      assert.deepEqual(transformed, transformBefore);
      assert.ok(!FRONT_MATTER.test(transformed.text));
    });

    test("classifying again drops the enrichment and makes enrich stale", async () => {
      const backend = fastBackend();
      const { run, fileId } = await prepared(backend);
      await runStage(backend, run.id, "enrich");
      await runStage(backend, run.id, "classify");

      assert.deepEqual(statuses(await backend.getRun(run.id), "enrich"), ["stale"]);
      for (const stage of ["classify", "enrich"] as const) {
        const { text } = await backend.getOutput(run.id, fileId, stage);
        assert.match(text, FRONT_MATTER);
        for (const key of ENRICH_KEYS) assert.ok(!text.includes(key));
      }
    });

    test("after a reload, the enriched text is still there", async () => {
      const saved = new Map<string, string>();
      const storage = {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => void saved.set(key, value),
      };
      const before = fastBackend(storage);
      const { run, fileId } = await prepared(before);
      await runStage(before, run.id, "enrich");

      const after = fastBackend(storage);
      const classified = await after.getOutput(run.id, fileId, "classify");
      assert.ok(classified.text.includes("summary:"));
      assert.equal(classified.text, (await after.getOutput(run.id, fileId, "enrich")).text);
    });
  });

  describe("extraction", () => {
    const ADR_FILE = MOCK_FILES.find((f) => f.name === "Architecture decisions 2026.pdf")!;
    const memoryStorage = () => {
      const saved = new Map<string, string>();
      return {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => void saved.set(key, value),
      };
    };

    async function enriched(backend: MockBackend) {
      const run = await backend.createRun([ADR_FILE]);
      for (const stage of ["ingest", "transform", "classify", "enrich"] as const) {
        await runStage(backend, run.id, stage);
      }
      return { run, fileId: run.files[0].id };
    }

    test("the definition starts at version 1 from the default, and saving bumps it", async () => {
      const backend = fastBackend();
      const run = await backend.createRun(FILES);
      const first = await backend.getDefinition(run.id);
      assert.equal(first.version, 1);
      assert.deepEqual(
        { ...first, version: undefined },
        { ...DEFAULT_EXTRACTION_DEFINITION, version: undefined },
      );

      const saved = await backend.saveDefinition(run.id, { ...first, prompt: "Other" }, 1);
      assert.equal(saved.version, 2);
      assert.equal((await backend.getDefinition(run.id)).prompt, "Other");

      first.prompt = "changed by the caller";
      assert.equal((await backend.getDefinition(run.id)).prompt, "Other", "returns copies");
    });

    test("a stale base version is a 409, duplicate or empty keys a 422", async () => {
      const backend = fastBackend();
      const run = await backend.createRun(FILES);
      const definition = await backend.getDefinition(run.id);
      await backend.saveDefinition(run.id, definition, 1);
      await rejectsWithCode(
        backend.saveDefinition(run.id, definition, 1),
        "definition_conflict",
        409,
      );

      const [type] = definition.recordTypes;
      const duplicate = {
        ...definition,
        recordTypes: [{ ...type, fields: [type.fields[0], type.fields[0]] }],
      };
      await rejectsWithCode(
        backend.saveDefinition(run.id, duplicate, 2),
        "invalid_definition",
        422,
      );
      const empty = {
        ...definition,
        recordTypes: [{ ...type, fields: [{ ...type.fields[0], key: " " }] }],
      };
      await rejectsWithCode(backend.saveDefinition(run.id, empty, 2), "invalid_definition", 422);
    });

    test("a file has no extraction before the run, and records after it", async () => {
      const backend = fastBackend();
      const { run, fileId } = await enriched(backend);
      await rejectsWithCode(backend.getFileExtraction(run.id, fileId), "extraction_not_found", 404);

      await runStage(backend, run.id, "extract");
      const extraction = await backend.getFileExtraction(run.id, fileId);
      const enrichCell = (await backend.getRun(run.id)).cells.find(
        (c) => c.fileId === fileId && c.stage === "enrich",
      )!;
      assert.equal(extraction.records.length, 3);
      assert.equal(extraction.revision, 1);
      assert.equal(extraction.definitionVersion, 1);
      assert.equal(extraction.sourceEtag, enrichCell.output!.etag);

      const text = (await backend.getOutput(run.id, fileId, "enrich")).text;
      for (const span of extraction.records.map((r) => r.span!)) {
        assert.equal([...text].slice(span.start, span.end).join(""), span.quote);
      }
    });

    test("running extract again bumps the revision, and a version that is not the latest is a 409", async () => {
      const backend = fastBackend();
      const { run, fileId } = await enriched(backend);
      await runStage(backend, run.id, "extract");
      await backend.saveDefinition(run.id, await backend.getDefinition(run.id), 1);

      await rejectsWithCode(
        backend.executeStage(run.id, "extract", { config: { definitionVersion: 1 } }),
        "definition_conflict",
        409,
      );
      await backend.executeStage(run.id, "extract", { config: { definitionVersion: 2 } });
      await until(
        async () => (await backend.getFileExtraction(run.id, fileId)).revision === 2,
        "the second extraction is stored",
      );
      assert.equal((await backend.getFileExtraction(run.id, fileId)).definitionVersion, 2);
    });

    test("subscribers hear that a file's records changed", async () => {
      const backend = fastBackend();
      const { run, fileId } = await enriched(backend);
      const changes: ExtractionChange[] = [];
      let opened = 0;
      backend.subscribe(run.id, {
        onCell: () => {},
        onExtractionChanged: (change) => changes.push(change),
        onOpen: () => opened++,
      });
      await until(() => opened === 1, "the subscription is open");

      await runStage(backend, run.id, "extract");
      assert.deepEqual(changes, [{ fileId, revision: 1 }]);
    });

    test("after a reload, the extraction and the definition are still there", async () => {
      const storage = memoryStorage();
      const before = fastBackend(storage);
      const { run, fileId } = await enriched(before);
      await runStage(before, run.id, "extract");
      await before.saveDefinition(run.id, await before.getDefinition(run.id), 1);

      const after = fastBackend(storage);
      assert.equal((await after.getFileExtraction(run.id, fileId)).records.length, 3);
      assert.equal((await after.getDefinition(run.id)).version, 2);
    });

    describe("manual changes", () => {
      async function labelled(backend: MockBackend) {
        const { run, fileId } = await enriched(backend);
        const definition = await backend.getDefinition(run.id);
        const type = definition.recordTypes[0];
        const field = (key: string) => type.fields.find((f) => f.key === key)!;
        const text = (await backend.getOutput(run.id, fileId, "enrich")).text;
        const span = (quote: string) => {
          const at = text.indexOf(quote);
          assert.ok(at >= 0, `"${quote}" is in the text`);
          const start = [...text.slice(0, at)].length;
          return { start, end: start + [...quote].length, quote };
        };
        return { run, fileId, type, field, text, span };
      }

      test("labelling from scratch creates the extraction at revision 1", async () => {
        const backend = fastBackend();
        const { run, fileId, type, field, span } = await labelled(backend);
        const title = field("title");
        const quote = "Architecture";
        const extraction = await backend.addRecord(
          run.id,
          fileId,
          {
            recordTypeId: type.id,
            span: span(quote),
            fields: [{ fieldId: title.id, values: [{ value: quote, spans: [span(quote)] }] }],
          },
          0,
        );
        const enrichCell = (await backend.getRun(run.id)).cells.find(
          (c) => c.fileId === fileId && c.stage === "enrich",
        )!;
        assert.equal(extraction.revision, 1);
        assert.equal(extraction.sourceEtag, enrichCell.output!.etag);
        assert.equal(extraction.definitionVersion, 1);
        const [record] = extraction.records;
        assert.equal(extraction.records.length, 1);
        assert.deepEqual(
          [record.origin, record.review, record.useAsExample],
          ["human", "accepted", false],
        );
        assert.equal(record.fields.length, type.fields.length, "every field is listed");
        const given = record.fields.find((v) => v.fieldId === title.id)!;
        assert.deepEqual(
          [given.value, given.origin, given.review, given.anchored],
          [quote, "human", "accepted", true],
        );
        const empty = record.fields.find((v) => v.fieldId === field("status").id)!;
        assert.equal(empty.value, null);
        assert.deepEqual([empty.origin, empty.review], ["human", "accepted"]);
        assert.deepEqual(await backend.getFileExtraction(run.id, fileId), extraction);
      });

      test("it needs the enriched text, and the other changes need an extraction", async () => {
        const backend = fastBackend();
        const run = await backend.createRun([ADR_FILE]);
        const fileId = run.files[0].id;
        const { id: recordTypeId } = (await backend.getDefinition(run.id)).recordTypes[0];
        await rejectsWithCode(
          backend.addRecord(run.id, fileId, { recordTypeId, span: null }, 0),
          "upstream_not_ready",
          422,
        );
        await rejectsWithCode(
          backend.updateRecord(run.id, fileId, "x", { useAsExample: true }, 0),
          "extraction_not_found",
          404,
        );
        await rejectsWithCode(
          backend.deleteRecord(run.id, fileId, "x", 0),
          "extraction_not_found",
          404,
        );
        await rejectsWithCode(
          backend.setFieldValues(run.id, fileId, "x", "f", [], 0),
          "extraction_not_found",
          404,
        );
        await rejectsWithCode(
          backend.setValueReview(run.id, fileId, "x", "v", "accepted", 0),
          "extraction_not_found",
          404,
        );
      });

      test("a stale revision is a 409 and changes nothing", async () => {
        const backend = fastBackend();
        const { run, fileId, type } = await labelled(backend);
        const first = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        await rejectsWithCode(
          backend.addRecord(run.id, fileId, { recordTypeId: type.id, span: null }, 0),
          "revision_conflict",
          409,
        );
        await rejectsWithCode(
          backend.updateRecord(run.id, fileId, first.records[0].id, { useAsExample: true }, 5),
          "revision_conflict",
          409,
        );
        assert.deepEqual(await backend.getFileExtraction(run.id, fileId), first);
      });

      test("unknown records, values, types and fields are rejected", async () => {
        const backend = fastBackend();
        const { run, fileId, type, field } = await labelled(backend);
        await rejectsWithCode(
          backend.addRecord(run.id, fileId, { recordTypeId: "nope", span: null }, 0),
          "unknown_field",
          422,
        );
        await rejectsWithCode(
          backend.addRecord(
            run.id,
            fileId,
            { recordTypeId: type.id, span: null, fields: [{ fieldId: "nope", values: [] }] },
            0,
          ),
          "unknown_field",
          422,
        );
        const { revision, records } = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        const [record] = records;
        await rejectsWithCode(
          backend.updateRecord(run.id, fileId, "nope", { useAsExample: true }, revision),
          "record_not_found",
          404,
        );
        await rejectsWithCode(
          backend.setFieldValues(run.id, fileId, record.id, "nope", [], revision),
          "unknown_field",
          422,
        );
        await rejectsWithCode(
          backend.setValueReview(run.id, fileId, record.id, "nope", "rejected", revision),
          "value_not_found",
          404,
        );
        assert.ok(field("title"));
      });

      test("a span that does not match the text is a 422", async () => {
        const backend = fastBackend();
        const { run, fileId, type, field, span } = await labelled(backend);
        const wrong = { start: 0, end: 5, quote: "not the text at zero" };
        await rejectsWithCode(
          backend.addRecord(run.id, fileId, { recordTypeId: type.id, span: wrong }, 0),
          "invalid_span",
          422,
        );
        await rejectsWithCode(
          backend.addRecord(
            run.id,
            fileId,
            {
              recordTypeId: type.id,
              span: null,
              fields: [{ fieldId: field("title").id, values: [{ value: "x", spans: [wrong] }] }],
            },
            0,
          ),
          "invalid_span",
          422,
        );
        const { revision, records } = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: span("Architecture") },
          0,
        );
        await rejectsWithCode(
          backend.updateRecord(run.id, fileId, records[0].id, { span: wrong }, revision),
          "invalid_span",
          422,
        );
        await rejectsWithCode(
          backend.setFieldValues(
            run.id,
            fileId,
            records[0].id,
            field("title").id,
            [{ value: "x", spans: [wrong] }],
            revision,
          ),
          "invalid_span",
          422,
        );
        assert.equal((await backend.getFileExtraction(run.id, fileId)).revision, revision);
      });

      test("accepting a record accepts its suggested values, rejecting leaves them", async () => {
        const backend = fastBackend();
        const { run, fileId } = await enriched(backend);
        await runStage(backend, run.id, "extract");
        const before = await backend.getFileExtraction(run.id, fileId);
        const [first, second] = before.records;
        assert.ok(first.fields.every((v) => v.review === "suggested"));

        const rejectedValue = first.fields[0];
        const afterValue = await backend.setValueReview(
          run.id,
          fileId,
          first.id,
          rejectedValue.id,
          "rejected",
          before.revision,
        );
        assert.equal(afterValue.revision, before.revision + 1);
        assert.equal(afterValue.records[0].fields[0].origin, "llm", "origin unchanged");

        const accepted = await backend.updateRecord(
          run.id,
          fileId,
          first.id,
          { review: "accepted", useAsExample: true },
          afterValue.revision,
        );
        const [record] = accepted.records;
        assert.equal(record.review, "accepted");
        assert.equal(record.origin, "llm", "origin unchanged");
        assert.equal(record.useAsExample, true);
        assert.equal(record.fields[0].review, "rejected", "a decision already made stays");
        assert.ok(record.fields.slice(1).every((v) => v.review === "accepted"));
        assert.equal(accepted.records[1].review, second.review, "other records untouched");
      });

      test("deleting works for a person's records only", async () => {
        const backend = fastBackend();
        const { run, fileId, type } = await labelled(backend);
        await runStage(backend, run.id, "extract");
        const loaded = await backend.getFileExtraction(run.id, fileId);
        await rejectsWithCode(
          backend.deleteRecord(run.id, fileId, loaded.records[0].id, loaded.revision),
          "not_deletable",
          422,
        );
        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          loaded.revision,
        );
        const mine = added.records.find((r) => r.origin === "human")!;
        const after = await backend.deleteRecord(run.id, fileId, mine.id, added.revision);
        assert.equal(after.revision, added.revision + 1);
        assert.equal(after.records.length, loaded.records.length);
        assert.ok(after.records.every((r) => r.id !== mine.id));
      });

      test("setting a field's values replaces them, an empty list leaves a placeholder", async () => {
        const backend = fastBackend();
        const { run, fileId, type, field, span } = await labelled(backend);
        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        const id = added.records[0].id;
        const approvers = field("approved_by");
        const two = [
          { value: "Architecture", spans: [span("Architecture")] },
          { value: "Architecture", spans: [] },
        ];
        const set = await backend.setFieldValues(
          run.id,
          fileId,
          id,
          approvers.id,
          two,
          added.revision,
        );
        const values = set.records[0].fields.filter((v) => v.fieldId === approvers.id);
        assert.equal(values.length, 2);
        assert.ok(values.every((v) => v.origin === "human" && v.review === "accepted"));
        assert.equal(set.records[0].fields.length, type.fields.length - 1 + 2);

        const cleared = await backend.setFieldValues(
          run.id,
          fileId,
          id,
          approvers.id,
          [],
          set.revision,
        );
        const left = cleared.records[0].fields.filter((v) => v.fieldId === approvers.id);
        assert.equal(left.length, 1);
        assert.equal(left[0].value, null);
        assert.notEqual(left[0].id, values[0].id);
      });

      test("a single-value field given several values is a 422", async () => {
        const backend = fastBackend();
        const { run, fileId, type, field } = await labelled(backend);
        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        await rejectsWithCode(
          backend.setFieldValues(
            run.id,
            fileId,
            added.records[0].id,
            field("title").id,
            [
              { value: "a", spans: [] },
              { value: "b", spans: [] },
            ],
            added.revision,
          ),
          "too_many_values",
          422,
        );
      });

      test("subscribers hear about a manual change, and it survives a reload", async () => {
        const storage = memoryStorage();
        const backend = fastBackend(storage);
        const { run, fileId, type } = await labelled(backend);
        const changes: ExtractionChange[] = [];
        let opened = 0;
        backend.subscribe(run.id, {
          onCell: () => {},
          onExtractionChanged: (change) => changes.push(change),
          onOpen: () => opened++,
        });
        await until(() => opened === 1, "the subscription is open");

        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        await backend.updateRecord(run.id, fileId, added.records[0].id, { useAsExample: true }, 1);
        assert.deepEqual(changes, [
          { fileId, revision: 1 },
          { fileId, revision: 2 },
        ]);

        const after = fastBackend(storage);
        const loaded = await after.getFileExtraction(run.id, fileId);
        assert.equal(loaded.revision, 2);
        assert.equal(loaded.records[0].useAsExample, true);
      });

      test("results are copies", async () => {
        const backend = fastBackend();
        const { run, fileId, type } = await labelled(backend);
        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: type.id, span: null },
          0,
        );
        added.records[0].review = "rejected";
        assert.equal(
          (await backend.getFileExtraction(run.id, fileId)).records[0].review,
          "accepted",
        );
      });
    });

    describe("running extract again keeps human work", () => {
      async function extracted(backend: MockBackend) {
        const { run, fileId } = await enriched(backend);
        await runStage(backend, run.id, "extract");
        return { run, fileId, first: await backend.getFileExtraction(run.id, fileId) };
      }
      async function rerun(backend: MockBackend, runId: string, fileId: string, revision: number) {
        await runStage(backend, runId, "extract");
        await until(
          async () => (await backend.getFileExtraction(runId, fileId)).revision > revision,
          "the new extraction is stored",
        );
        return backend.getFileExtraction(runId, fileId);
      }

      test("an accepted record survives unchanged and is not added twice", async () => {
        const backend = fastBackend();
        const { run, fileId, first } = await extracted(backend);
        const accepted = await backend.updateRecord(
          run.id,
          fileId,
          first.records[0].id,
          { review: "accepted" },
          first.revision,
        );
        const again = await rerun(backend, run.id, fileId, accepted.revision);
        assert.deepEqual(
          again.records.find((r) => r.id === first.records[0].id),
          accepted.records[0],
        );
        assert.equal(
          again.records.length,
          first.records.length,
          "no duplicate of the accepted one",
        );
      });

      test("a rejected record stays rejected and is not suggested again", async () => {
        const backend = fastBackend();
        const { run, fileId, first } = await extracted(backend);
        const rejected = await backend.updateRecord(
          run.id,
          fileId,
          first.records[0].id,
          { review: "rejected" },
          first.revision,
        );
        const again = await rerun(backend, run.id, fileId, rejected.revision);
        assert.equal(again.records.length, first.records.length);
        assert.equal(again.records.find((r) => r.id === first.records[0].id)?.review, "rejected");
        assert.equal(
          again.records.filter((r) => r.review === "suggested").length,
          first.records.length - 1,
        );
      });

      test("a record a person added survives", async () => {
        const backend = fastBackend();
        const { run, fileId, first } = await extracted(backend);
        const added = await backend.addRecord(
          run.id,
          fileId,
          { recordTypeId: first.records[0].recordTypeId, span: null },
          first.revision,
        );
        const mine = added.records.find((r) => r.origin === "human")!;
        const again = await rerun(backend, run.id, fileId, added.revision);
        assert.deepEqual(
          again.records.find((r) => r.id === mine.id),
          mine,
        );
        assert.equal(again.records.at(-1)!.id, mine.id, "no span: last");
      });

      test("untouched suggestions are replaced by new ones", async () => {
        const backend = fastBackend();
        const { run, fileId, first } = await extracted(backend);
        const again = await rerun(backend, run.id, fileId, first.revision);
        assert.equal(again.records.length, first.records.length);
        const old = new Set(first.records.map((r) => r.id));
        assert.ok(again.records.every((r) => !old.has(r.id)));
      });

      test("a record with one human-edited value is kept whole", async () => {
        const backend = fastBackend();
        const { run, fileId, first } = await extracted(backend);
        const record = first.records[0];
        const status = record.fields.find((v) => v.fieldId === "f-adr-status")!;
        const edited = await backend.setFieldValues(
          run.id,
          fileId,
          record.id,
          status.fieldId,
          [{ value: "superseded", spans: [] }],
          first.revision,
        );
        const again = await rerun(backend, run.id, fileId, edited.revision);
        assert.deepEqual(
          again.records.find((r) => r.id === record.id),
          edited.records[0],
        );
        assert.equal(again.records.length, first.records.length);
      });
    });

    test("unanchorNext() leaves one value whose quote is not in the text", async () => {
      const backend = fastBackend();
      const { run, fileId } = await enriched(backend);
      backend.unanchorNext();
      await runStage(backend, run.id, "extract");

      const text = (await backend.getOutput(run.id, fileId, "enrich")).text;
      const values = (await backend.getFileExtraction(run.id, fileId)).records.flatMap(
        (r) => r.fields,
      );
      const unanchored = values.filter((v) => !v.anchored);
      assert.equal(unanchored.length, 1);
      assert.ok(!text.includes(unanchored[0].spans[0].quote));

      await runStage(backend, run.id, "extract");
      const again = (await backend.getFileExtraction(run.id, fileId)).records.flatMap(
        (r) => r.fields,
      );
      assert.ok(
        again.every((v) => v.anchored),
        "only the next extraction",
      );
    });
  });
});

describe("setFieldValues keeps what was sent back unchanged", () => {
  test("adding one value to a list leaves the others suggested, with their ids", async () => {
    const backend = new MockBackend({ speed: 0, storage: null });
    const adr = MOCK_FILES.find((file) => file.name.startsWith("Architecture decisions"))!;
    const run = await backend.createRun([adr]);
    const fileId = run.files[0].id;
    for (const stage of ["ingest", "transform", "classify", "enrich", "extract"] as const) {
      await backend.executeStage(run.id, stage);
      for (let i = 0; i < 500; i++) {
        const cells = (await backend.getRun(run.id)).cells.filter((c) => c.stage === stage);
        if (cells.every((c) => c.status === "succeeded")) break;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    const definition = await backend.getDefinition(run.id);
    const field = definition.recordTypes[0].fields.find((f) => f.key === "approved_by")!;
    const extraction = await backend.getFileExtraction(run.id, fileId);
    const record = extraction.records[0];
    const existing = record.fields.filter((v) => v.fieldId === field.id);
    assert.equal(existing.length, 2);

    const title = record.fields.find((v) => v.spans.length > 0 && v.fieldId !== field.id)!;
    const after = await backend.setFieldValues(
      run.id,
      fileId,
      record.id,
      field.id,
      [
        ...existing.map((v) => ({ value: v.value, spans: v.spans })),
        { value: title.value, spans: title.spans },
      ],
      extraction.revision,
    );
    const values = after.records[0].fields.filter((v) => v.fieldId === field.id);
    assert.deepEqual(
      values.map((v) => [v.origin, v.review]),
      [
        ["llm", "suggested"],
        ["llm", "suggested"],
        ["human", "accepted"],
      ],
    );
    assert.deepEqual(
      values.slice(0, 2).map((v) => v.id),
      existing.map((v) => v.id),
    );
  });
});

describe("assistant and publishing", () => {
  const memoryStorage = () => {
    const saved = new Map<string, string>();
    return {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
  };
  const ADR_FILE = MOCK_FILES.find((f) => f.name === "Architecture decisions 2026.pdf")!;
  const empty = () => ({
    prompt: "",
    recordTypes: [],
    output: { format: "markdown" as const, template: "" },
  });

  async function listening(backend: MockBackend, runId: string) {
    const events: AssistantEvent[] = [];
    let opened = 0;
    backend.subscribe(runId, {
      onCell: () => {},
      onAssistantEvent: (event) => events.push(event),
      onOpen: () => opened++,
    });
    await until(() => opened === 1, "the subscription is open");
    return events;
  }

  const finished = (backend: MockBackend, runId: string) =>
    until(
      async () => (await backend.getAssistantMessages(runId)).every((m) => m.status === "done"),
      "the reply is done",
    );

  test("a reply streams as delta…, proposal, done, and matches the stored message", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    const events = await listening(backend, run.id);

    const sent = await backend.sendAssistantMessage(run.id, "Extract all ADRs", empty());
    assert.equal(sent.role, "user");
    assert.equal(sent.status, "done");
    await finished(backend, run.id);

    const [user, assistant] = await backend.getAssistantMessages(run.id);
    assert.equal(user.id, sent.id);
    assert.equal(assistant.role, "assistant");
    assert.equal(assistant.status, "done");

    const types = events.map((e) => e.type);
    const deltas = types.filter((t) => t === "delta").length;
    assert.ok(deltas >= 2, "in several chunks");
    assert.deepEqual(types, [...Array(deltas).fill("delta"), "proposal", "done"]);
    assert.ok(events.every((e) => e.messageId === assistant.id));
    const streamed = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    assert.equal(streamed, assistant.text);
    const proposal = events.find((e) => e.type === "proposal");
    assert.ok(proposal && proposal.type === "proposal");
    assert.deepEqual(proposal.proposal, assistant.proposal);
    assert.equal(assistant.proposal?.definition.recordTypes[0].name, "ADR");
  });

  test("a reply without a proposal sends delta and done only", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    const events = await listening(backend, run.id);
    await backend.sendAssistantMessage(run.id, "hmm", DEFAULT_EXTRACTION_DEFINITION);
    await finished(backend, run.id);
    assert.equal(events.at(-1)?.type, "done");
    assert.ok(!events.some((e) => e.type === "proposal"));
    assert.equal((await backend.getAssistantMessages(run.id))[1].proposal, null);
  });

  test("blank text is 422 empty_message and nothing is stored", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    await rejectsWithCode(
      backend.sendAssistantMessage(run.id, "   ", empty()),
      "empty_message",
      422,
    );
    assert.deepEqual(await backend.getAssistantMessages(run.id), []);
  });

  test("a second message while a reply is streaming is 409 assistant_busy", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    await backend.sendAssistantMessage(run.id, "Extract all ADRs", empty());
    await rejectsWithCode(
      backend.sendAssistantMessage(run.id, "and more", empty()),
      "assistant_busy",
      409,
    );
    await finished(backend, run.id);
    await backend.sendAssistantMessage(run.id, "drop context", DEFAULT_EXTRACTION_DEFINITION);
    await finished(backend, run.id);
    const roles = (await backend.getAssistantMessages(run.id)).map((m) => m.role);
    assert.deepEqual(roles, ["user", "assistant", "user", "assistant"]);
  });

  test("a dropped connection misses the events; the messages are the truth", async () => {
    const backend = fastBackend();
    const run = await backend.createRun(FILES);
    const events = await listening(backend, run.id);
    backend.dropConnection(50);
    await backend.sendAssistantMessage(run.id, "Extract all ADRs", empty());
    await finished(backend, run.id);
    assert.deepEqual(events, []);
    assert.ok((await backend.getAssistantMessages(run.id))[1].text.length > 0);
  });

  test("the conversation survives a reload, and a reply cut off by it is marked done", async () => {
    const storage = memoryStorage();
    const before = new MockBackend({ speed: 0, storage });
    const run = await before.createRun(FILES);
    await before.sendAssistantMessage(run.id, "Extract all ADRs", empty());
    // The page goes away while the reply is still being written.
    const after = new MockBackend({ speed: 0, storage });
    const messages = await after.getAssistantMessages(run.id);
    assert.equal(messages.length, 2);
    assert.ok(messages.every((m) => m.status === "done"));
    await after.sendAssistantMessage(run.id, "drop context", DEFAULT_EXTRACTION_DEFINITION);
  });

  describe("publishing", () => {
    async function withExamples(backend: MockBackend) {
      const run = await backend.createRun([ADR_FILE]);
      for (const stage of ["ingest", "transform", "classify", "enrich", "extract"] as const) {
        await runStage(backend, run.id, stage);
      }
      const fileId = run.files[0].id;
      const { records, revision: first } = await backend.getFileExtraction(run.id, fileId);
      let revision = first;
      // Two records marked as examples: one accepted, one still a suggestion.
      for (const [i, review] of (["accepted", "suggested"] as const).entries()) {
        const patch = { useAsExample: true, ...(review === "accepted" ? { review } : {}) };
        ({ revision } = await backend.updateRecord(run.id, fileId, records[i].id, patch, revision));
      }
      return { run, fileId };
    }

    test("counts only accepted examples and raises the version each time", async () => {
      const backend = fastBackend();
      const { run } = await withExamples(backend);
      assert.deepEqual(await backend.publishDefinition(run.id), {
        pipelineConfigVersion: 1,
        examples: 1,
      });
      assert.deepEqual(await backend.publishDefinition(run.id), {
        pipelineConfigVersion: 2,
        examples: 1,
      });
    });

    test("the version is kept across a reload and counted per run", async () => {
      const storage = memoryStorage();
      const before = fastBackend(storage);
      const first = await before.createRun(FILES);
      const second = await before.createRun(FILES);
      await before.publishDefinition(first.id);
      const after = fastBackend(storage);
      assert.equal((await after.publishDefinition(first.id)).pipelineConfigVersion, 2);
      assert.equal((await after.publishDefinition(second.id)).pipelineConfigVersion, 1);
    });

    test("a definition without record types is 422 nothing_to_publish", async () => {
      const backend = fastBackend();
      const run = await backend.createRun(FILES);
      await backend.saveDefinition(run.id, empty(), 1);
      await rejectsWithCode(backend.publishDefinition(run.id), "nothing_to_publish", 422);
    });

    test("an extraction run is given the accepted examples", async () => {
      const backend = fastBackend();
      const { run } = await withExamples(backend);
      assert.equal(backend.lastExamplesUsed(run.id), 0, "none existed at the first run");
      await runStage(backend, run.id, "extract");
      assert.equal(backend.lastExamplesUsed(run.id), 1);
    });
  });
});

describe("storage documents (Knowledge Studio)", () => {
  const studio = () => fastBackend();
  const DOCS = MOCK_DOCUMENTS.slice(0, 2);

  test("a run of documents has only the extract stage, which runs without an upstream one", async () => {
    const backend = studio();
    const run = await backend.createRun(DOCS);
    assert.equal(run.cells.length, DOCS.length);
    assert.deepEqual(statuses(run, "extract"), ["pending", "pending"]);
    assert.deepEqual(statuses(run, "ingest"), []);
    await runStage(backend, run.id, "extract");
    assert.deepEqual(statuses(await backend.getRun(run.id), "extract"), ["succeeded", "succeeded"]);
  });

  test("a run can't mix storage documents with other files", async () => {
    await rejectsWithCode(studio().createRun([FILES[0], DOCS[0]]), "mixed_sources", 422);
  });

  test("a run of other files is still the full pipeline beside a run of documents", async () => {
    const backend = studio();
    await backend.createRun(DOCS);
    const run = await backend.createRun(FILES);
    assert.equal(run.cells.length, FILES.length * 6);
  });

  test("the storage listing has the documents and is filtered like the other sources", async () => {
    const backend = fastBackend();
    const all = await backend.listFiles("storage", "");
    assert.equal(all.length, MOCK_DOCUMENTS.length);
    assert.ok(all.every((d) => d.source === "storage" && d.type === "md" && d.etag));
    assert.ok(MOCK_DOCUMENTS.length >= 8);

    const found = await backend.listFiles("storage", " ADR ");
    assert.ok(found.length >= 1 && found.every((d) => /adr/i.test(d.name + d.location)));
    assert.ok((await backend.listFiles("confluence", "")).every((f) => f.source === "confluence"));
  });

  test("a document is read with its text and etag; an unknown id is 404", async () => {
    const backend = fastBackend();
    const [first] = await backend.listFiles("storage", "");
    const content = await backend.getDocument(first.id);
    assert.equal(content.etag, first.etag);
    assert.equal(content.contentType, "text/markdown");
    assert.ok(content.text.startsWith("---\n"));
    await rejectsWithCode(backend.getDocument("doc-nope"), "document_not_found", 404);
  });

  test("a run of documents extracts from the document, with its etag, and takes corrections", async () => {
    const backend = studio();
    const adr = MOCK_DOCUMENTS.find((d) => d.name === "architecture-decisions-2026.md")!;
    const run = await backend.createRun([adr]);
    assert.equal(run.cells.length, 1);
    const fileId = run.files[0].id;

    await runStage(backend, run.id, "extract");
    const extraction = await backend.getFileExtraction(run.id, fileId);
    assert.equal(extraction.sourceEtag, adr.etag);
    assert.ok(extraction.records.length > 0);

    const updated = await backend.updateRecord(
      run.id,
      fileId,
      extraction.records[0].id,
      { review: "accepted" },
      extraction.revision,
    );
    assert.equal(updated.revision, extraction.revision + 1);
    assert.equal(updated.sourceEtag, adr.etag);
    assert.equal(updated.records[0].review, "accepted");
  });

  test("reset forgets every run, its saved copy and its live subscriptions", async () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
    const backend = fastBackend(storage);
    const run = await backend.createRun(FILES);
    await backend.executeStage(run.id, "ingest");
    assert.equal(items.size, 1);
    let opened = 0;
    backend.subscribe(run.id, { onCell: () => {}, onOpen: () => void opened++ });

    backend.reset();

    assert.equal(items.size, 0);
    await rejectsWithCode(backend.getRun(run.id), "run_not_found", 404);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(opened, 0);
    assert.equal((await fastBackend(storage).createRun(FILES)).files.length, FILES.length);
  });
});
