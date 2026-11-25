import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import {
  parseAssistantEventMessage,
  parseAssistantMessage,
  parseAssistantMessages,
  parseCellMessage,
  isAssistantClearedMessage,
  isRunChangedMessage,
  parseCustomChunkingResult,
  parseDefinition,
  parseDefinitionVersions,
  parseEtagHeader,
  parseExecution,
  parseExtractionChangedMessage,
  parseFileExtraction,
  parseProject,
  parseProjectPage,
  parseProjects,
  parsePublishResult,
  parseRun,
  parseBackendStatus,
  parseSourceFiles,
  parseTemplates,
  toWireDefinition,
  toWireExecutionConfig,
  toWireFieldValues,
  toWireNewRecord,
  toWireRecordPatch,
  toWireValueReview,
} from "./parsers";

const wireFile = {
  id: "file_1",
  source_ref: "cf-001",
  name: "Leave policy 2026.pdf",
  source: "confluence",
  type: "pdf",
  size_bytes: 482_113,
  location: "HR / Policies",
  modified_at: "2026-10-02T09:12:00Z",
};

const wireCell = {
  file_id: "file_1",
  stage: "transform",
  status: "succeeded",
  execution_id: "exec_1",
  progress: null,
  error: null,
  output: { name: "leave-policy-2026.md", content_type: "text/markdown", size: 2048, etag: "v2" },
  updated_at: "2026-11-14T10:00:00Z",
};

const isInvalidResponse = (error: unknown) => {
  assert.ok(isApiError(error), "throws an ApiError");
  assert.equal(error.code, "invalid_response");
  return true;
};

describe("parsers", () => {
  test("a run comes out in the UI's shape (camelCase)", () => {
    const run = parseRun({
      id: "run_1",
      created_at: "2026-11-14T09:00:00Z",
      files: [wireFile],
      cells: [wireCell],
    });

    assert.deepEqual(run, {
      id: "run_1",
      createdAt: "2026-11-14T09:00:00Z",
      files: [
        {
          id: "file_1",
          sourceRef: "cf-001",
          name: "Leave policy 2026.pdf",
          source: "confluence",
          type: "pdf",
          sizeBytes: 482_113,
          location: "HR / Policies",
          modifiedAt: "2026-10-02T09:12:00Z",
        },
      ],
      cells: [
        {
          fileId: "file_1",
          stage: "transform",
          status: "succeeded",
          executionId: "exec_1",
          progress: null,
          error: null,
          output: {
            name: "leave-policy-2026.md",
            contentType: "text/markdown",
            sizeBytes: 2048,
            etag: "v2",
          },
          updatedAt: "2026-11-14T10:00:00Z",
        },
      ],
    });
  });

  test("a cell for a stage this UI doesn't know is skipped, not an error", () => {
    const run = parseRun({
      id: "run_1",
      created_at: "2026-11-14T09:00:00Z",
      files: [wireFile],
      cells: [wireCell, { ...wireCell, stage: "translate" }],
    });
    assert.equal(run.cells.length, 1);
  });

  test("progress is kept within 0–100", () => {
    const message = (progress: number) =>
      parseCellMessage({ type: "cell", cell: { ...wireCell, status: "running", progress } });
    assert.equal(message(140)?.progress, 100);
    assert.equal(message(-5)?.progress, 0);
    assert.equal(message(42)?.progress, 42);
  });

  test("socket messages that aren't cells give null", () => {
    assert.equal(parseCellMessage({ type: "pong" }), null);
  });

  test("data of the wrong shape is refused with one clear error", () => {
    assert.throws(() => parseRun({ id: "run_1" }), isInvalidResponse);
    assert.throws(
      () => parseCellMessage({ type: "cell", cell: { ...wireCell, status: "finished" } }),
      isInvalidResponse,
    );
    assert.throws(() => parseSourceFiles([wireFile]), isInvalidResponse);
    assert.throws(
      () => parseExecution({ execution_id: "exec_1", stage: "select", file_ids: [] }),
      isInvalidResponse,
    );
  });

  test("an execution and a catalog page are read", () => {
    assert.deepEqual(
      parseExecution({ execution_id: "exec_1", stage: "ingest", file_ids: ["file_1"] }),
      { id: "exec_1", stage: "ingest", fileIds: ["file_1"] },
    );
    assert.equal(parseSourceFiles({ items: [wireFile] })[0].sizeBytes, 482_113);
  });
});

const wireDefinition = {
  version: 3,
  note: "Added a status",
  created_at: "2026-02-01T10:00:00Z",
  prompt: "Find decisions",
  record_types: [
    {
      id: "t1",
      name: "ADR",
      description: "A decision",
      fields: [
        {
          id: "f1",
          key: "status",
          name: "Status",
          description: "",
          mode: "inferred",
          value_type: "choice",
          choices: ["accepted", "rejected"],
          multiple: false,
        },
        {
          id: "f2",
          key: "owners",
          name: "Owners",
          description: "",
          mode: "quote",
          value_type: "text",
          multiple: true,
        },
      ],
    },
  ],
  output: { format: "markdown", template: "{{status}}" },
};

const wireSpan = { start: 3, end: 8, quote: "hello" };
const wireExtraction = {
  file_id: "file_1",
  revision: 4,
  source_etag: "e1",
  definition_version: 3,
  records: [
    {
      id: "r1",
      file_id: "file_1",
      record_type_id: "t1",
      span: wireSpan,
      origin: "llm",
      review: "suggested",
      use_as_example: false,
      fields: [
        {
          id: "v1",
          field_id: "f1",
          value: "accepted",
          spans: [wireSpan],
          origin: "human",
          review: "accepted",
          anchored: true,
        },
        {
          id: "v2",
          field_id: "f2",
          value: null,
          spans: [],
          origin: "llm",
          review: "suggested",
          anchored: false,
        },
      ],
    },
    {
      id: "r2",
      file_id: "file_1",
      record_type_id: "t1",
      span: null,
      origin: "human",
      review: "rejected",
      use_as_example: true,
      fields: [],
    },
  ],
};

describe("extraction parsers", () => {
  test("a definition comes out in the UI's shape; missing choices become []", () => {
    const d = parseDefinition(wireDefinition);
    assert.equal(d.version, 3);
    assert.equal(d.note, "Added a status");
    assert.equal(d.createdAt, "2026-02-01T10:00:00Z");
    assert.equal(d.output.format, "markdown");
    const [status, owners] = d.recordTypes[0].fields;
    assert.equal(status.valueType, "choice");
    assert.deepEqual(status.choices, ["accepted", "rejected"]);
    assert.deepEqual(owners.choices, []);
    assert.equal(owners.multiple, true);
  });

  test("toWireDefinition is the inverse of parseDefinition", () => {
    const { version, note, createdAt, ...draft } = parseDefinition(wireDefinition);
    assert.equal(version, 3);
    const wire = toWireDefinition(draft);
    assert.ok(!("version" in wire) && !("note" in wire));
    assert.deepEqual(
      parseDefinition({ version: 3, note, created_at: createdAt, ...wire }),
      parseDefinition(wireDefinition),
    );
    assert.equal(wire.record_types[0].fields[0].value_type, "choice");
  });

  test("chunking: read as the server sends it; absent is automatic; sent on every save", () => {
    assert.deepEqual(parseDefinition(wireDefinition).chunking, {
      strategy: "auto",
      size: null,
      custom: null,
    });
    const wired = { ...wireDefinition, chunking: { strategy: "paragraph", size: 3000 } };
    const d = parseDefinition(wired);
    assert.deepEqual(d.chunking, { strategy: "paragraph", size: 3000, custom: null });
    const { version, note, createdAt, ...draft } = d;
    assert.ok(version && note !== undefined && createdAt);
    assert.deepEqual(toWireDefinition(draft).chunking, {
      strategy: "paragraph",
      size: 3000,
      custom: null,
    });
    const auto = { ...wireDefinition, chunking: { strategy: "auto", size: null } };
    assert.deepEqual(toWireDefinition(parseDefinition(auto)).chunking, {
      strategy: "auto",
      size: null,
      custom: null,
    });
    const bad = { ...wireDefinition, chunking: { strategy: "sentence", size: null } };
    assert.throws(() => parseDefinition(bad), isInvalidResponse);
    const text = { ...wireDefinition, chunking: { strategy: "fixed", size: "4000" } };
    assert.throws(() => parseDefinition(text), isInvalidResponse);
  });

  test("custom chunking: the block is read and sent in snake_case; other strategies send null", () => {
    const block = {
      instruction: "Split at every level-2 heading",
      source_url: "https://example.com/page",
      code: "def split(text, size): ...",
      summary: "Splits at each level-2 heading.",
    };
    const wired = {
      ...wireDefinition,
      chunking: { strategy: "custom", size: 4000, custom: block },
    };
    const d = parseDefinition(wired);
    assert.deepEqual(d.chunking, {
      strategy: "custom",
      size: 4000,
      custom: {
        instruction: block.instruction,
        sourceUrl: block.source_url,
        code: block.code,
        summary: block.summary,
      },
    });
    const { version, note, createdAt, ...draft } = d;
    assert.ok(version && note !== undefined && createdAt);
    assert.deepEqual(toWireDefinition(draft).chunking, wired.chunking);
    // A null link stays null; a missing custom key reads as null; a custom strategy without a block too.
    const noLink = {
      ...wired,
      chunking: { ...wired.chunking, custom: { ...block, source_url: null } },
    };
    assert.equal(parseDefinition(noLink).chunking.custom?.sourceUrl, null);
    const missing = { ...wireDefinition, chunking: { strategy: "custom", size: 4000 } };
    assert.equal(parseDefinition(missing).chunking.custom, null);
    // Another strategy never carries a block, even one the server sent.
    const other = { ...wireDefinition, chunking: { strategy: "fixed", size: 4000, custom: block } };
    assert.equal(parseDefinition(other).chunking.custom, null);
    // And a custom block that is not an object of strings is invalid.
    const broken = { ...wired, chunking: { ...wired.chunking, custom: { ...block, code: 3 } } };
    assert.throws(() => parseDefinition(broken), isInvalidResponse);
    // Applied code is not sent for another strategy.
    const dropped = { ...draft, chunking: { ...draft.chunking, strategy: "fixed" as const } };
    assert.equal(toWireDefinition(dropped).chunking.custom, null);
  });

  test("the generate answer is read with camelCase names", () => {
    const answer = parseCustomChunkingResult({
      code: "def split(text, size): ...",
      summary: "Splits at headings.",
      documents: [
        {
          file_id: "f1",
          name: "adr-001.md",
          characters: 7123,
          parts: [{ start: 0, end: 595, starts_with: "## Decision 1" }],
        },
      ],
    });
    assert.deepEqual(answer.documents, [
      {
        fileId: "f1",
        name: "adr-001.md",
        characters: 7123,
        parts: [{ start: 0, end: 595, startsWith: "## Decision 1" }],
      },
    ]);
    assert.equal(answer.summary, "Splits at headings.");
    assert.throws(() => parseCustomChunkingResult({ code: "x", summary: "y" }), isInvalidResponse);
    assert.throws(
      () =>
        parseCustomChunkingResult({
          code: "x",
          summary: "y",
          documents: [{ file_id: "f", name: "n", characters: 1, parts: [{ start: 0 }] }],
        }),
      isInvalidResponse,
    );
  });

  test("a definition with an unknown enum value is invalid", () => {
    const bad = structuredClone(wireDefinition);
    bad.record_types[0].fields[0].mode = "guess";
    assert.throws(() => parseDefinition(bad), isInvalidResponse);
    const badFormat = { ...wireDefinition, output: { format: "xml", template: "" } };
    assert.throws(() => parseDefinition(badFormat), isInvalidResponse);
    assert.throws(() => parseDefinition(undefined), isInvalidResponse);
  });

  test("a file extraction comes out in the UI's shape", () => {
    const e = parseFileExtraction(wireExtraction);
    assert.equal(e.fileId, "file_1");
    assert.equal(e.revision, 4);
    assert.equal(e.sourceEtag, "e1");
    assert.equal(e.definitionVersion, 3);
    assert.equal(e.records.length, 2);
    const [r1, r2] = e.records;
    assert.deepEqual(r1.span, wireSpan);
    assert.equal(r1.recordTypeId, "t1");
    assert.equal(r1.fields[0].fieldId, "f1");
    assert.equal(r1.fields[0].origin, "human");
    assert.deepEqual(r1.fields[0].spans, [wireSpan]);
    assert.equal(r1.fields[1].value, null);
    assert.equal(r1.fields[1].anchored, false);
    assert.equal(r2.span, null);
    assert.equal(r2.useAsExample, true);
    assert.equal(r2.review, "rejected");
  });

  test("a file extraction with a bad enum or span is invalid", () => {
    const badReview = structuredClone(wireExtraction);
    badReview.records[0].review = "maybe";
    assert.throws(() => parseFileExtraction(badReview), isInvalidResponse);
    const badOrigin = structuredClone(wireExtraction);
    badOrigin.records[0].fields[0].origin = "robot";
    assert.throws(() => parseFileExtraction(badOrigin), isInvalidResponse);
    const badSpan = structuredClone(wireExtraction);
    (badSpan.records[0].span as unknown as { start: string }).start = "3";
    assert.throws(() => parseFileExtraction(badSpan), isInvalidResponse);
  });

  test("the extraction.changed message", () => {
    assert.deepEqual(
      parseExtractionChangedMessage({ type: "extraction.changed", file_id: "file_1", revision: 5 }),
      { fileId: "file_1", revision: 5 },
    );
    assert.equal(parseExtractionChangedMessage({ type: "cell" }), null);
    assert.equal(parseCellMessage({ type: "extraction.changed", file_id: "a", revision: 1 }), null);
    assert.throws(
      () => parseExtractionChangedMessage({ type: "extraction.changed", file_id: "a" }),
      isInvalidResponse,
    );
  });
});

describe("record write bodies", () => {
  const span = { start: 3, end: 8, quote: "hello" };

  test("a new record is snake_case and carries the revision", () => {
    assert.deepEqual(
      toWireNewRecord(
        {
          recordTypeId: "rt",
          span,
          fields: [{ fieldId: "f", values: [{ value: "x", spans: [span] }] }],
        },
        4,
      ),
      {
        revision: 4,
        record_type_id: "rt",
        span,
        fields: [{ field_id: "f", values: [{ value: "x", spans: [span] }] }],
      },
    );
  });

  test("a new record without a span or fields sends null and an empty list", () => {
    assert.deepEqual(toWireNewRecord({ recordTypeId: "rt", span: null }, 0), {
      revision: 0,
      record_type_id: "rt",
      span: null,
      fields: [],
    });
  });

  test("a patch sends only the keys it has", () => {
    assert.deepEqual(toWireRecordPatch({ review: "accepted" }, 2), {
      revision: 2,
      review: "accepted",
    });
    assert.deepEqual(toWireRecordPatch({ useAsExample: false }, 2), {
      revision: 2,
      use_as_example: false,
    });
  });

  test("a patch sends span: null when it is present", () => {
    assert.deepEqual(toWireRecordPatch({ span: null }, 2), { revision: 2, span: null });
    assert.deepEqual(toWireRecordPatch({ span }, 2), { revision: 2, span });
  });

  test("field values and value review", () => {
    assert.deepEqual(toWireFieldValues([], 1), { revision: 1, values: [] });
    assert.deepEqual(toWireFieldValues([{ value: null, spans: [span] }], 1), {
      revision: 1,
      values: [{ value: null, spans: [span] }],
    });
    assert.deepEqual(toWireValueReview("rejected", 5), { revision: 5, review: "rejected" });
  });
});

describe("assistant parsers", () => {
  const { version, ...wireBody } = wireDefinition;
  assert.equal(version, 3);
  const wireMessage = {
    id: "m1",
    role: "assistant",
    text: "Split it.",
    proposal: {
      definition: wireBody,
      reasons: [{ path: "ADR / Approved by", reason: "Two facts." }],
    },
    status: "done",
    created_at: "2026-11-14T10:00:00Z",
  };

  test("a message with a proposal and reasons", () => {
    const m = parseAssistantMessage(wireMessage);
    assert.equal(m.role, "assistant");
    assert.equal(m.status, "done");
    assert.equal(m.createdAt, "2026-11-14T10:00:00Z");
    assert.equal(m.proposal?.reasons[0].path, "ADR / Approved by");
    assert.equal(m.proposal?.definition.recordTypes[0].fields[0].valueType, "choice");
  });

  test("a message without a proposal, or a proposal without reasons", () => {
    const plain = parseAssistantMessage({ ...wireMessage, proposal: null, role: "user" });
    assert.equal(plain.proposal, null);
    const bare = parseAssistantMessage({ ...wireMessage, proposal: { definition: wireBody } });
    assert.deepEqual(bare.proposal?.reasons, []);
  });

  test("the list unwraps messages", () => {
    assert.equal(parseAssistantMessages({ messages: [wireMessage, wireMessage] }).length, 2);
    assert.throws(() => parseAssistantMessages({}), isInvalidResponse);
  });

  test("an unknown role or status is invalid", () => {
    assert.throws(
      () => parseAssistantMessage({ ...wireMessage, role: "system" }),
      isInvalidResponse,
    );
    assert.throws(
      () => parseAssistantMessage({ ...wireMessage, status: "failed" }),
      isInvalidResponse,
    );
  });

  test("events: delta, proposal, done", () => {
    assert.deepEqual(
      parseAssistantEventMessage({ type: "assistant.delta", message_id: "m1", text: "Hi" }),
      {
        type: "delta",
        messageId: "m1",
        text: "Hi",
      },
    );
    assert.deepEqual(parseAssistantEventMessage({ type: "assistant.done", message_id: "m1" }), {
      type: "done",
      messageId: "m1",
    });
    const withReasons = parseAssistantEventMessage({
      type: "assistant.proposal",
      message_id: "m1",
      proposal: wireMessage.proposal,
    });
    assert.equal(withReasons?.type === "proposal" && withReasons.proposal.reasons.length, 1);
    const without = parseAssistantEventMessage({
      type: "assistant.proposal",
      message_id: "m1",
      proposal: { definition: wireBody },
    });
    assert.ok(without?.type === "proposal");
    assert.deepEqual(without.proposal.reasons, []);
  });

  test("other message types give null; a broken event is invalid", () => {
    assert.equal(parseAssistantEventMessage({ type: "cell" }), null);
    assert.equal(parseAssistantEventMessage({ type: "pong" }), null);
    assert.throws(
      () => parseAssistantEventMessage({ type: "assistant.delta", message_id: "m1" }),
      isInvalidResponse,
    );
    assert.throws(
      () =>
        parseAssistantEventMessage({ type: "assistant.proposal", message_id: "m1", proposal: {} }),
      isInvalidResponse,
    );
  });

  test("publish result", () => {
    assert.deepEqual(parsePublishResult({ pipeline_config_version: 4, examples: 2 }), {
      pipelineConfigVersion: 4,
      examples: 2,
    });
    assert.throws(() => parsePublishResult({ examples: 2 }), isInvalidResponse);
  });
});

describe("storage documents", () => {
  test("a listed document keeps its etag; other items have none", () => {
    const [doc] = parseSourceFiles({
      items: [{ ...wireFile, source: "storage", type: "md", etag: "abc123" }],
    });
    assert.equal(doc.source, "storage");
    assert.equal(doc.etag, "abc123");
    assert.equal("etag" in parseSourceFiles({ items: [wireFile] })[0], false);
    assert.throws(
      () => parseSourceFiles({ items: [{ ...wireFile, etag: 7 }] }),
      (error) => isApiError(error) && error.code === "invalid_response",
    );
  });

  test("an ETag header loses its quotes and weak prefix, and must be there", () => {
    assert.equal(parseEtagHeader('"0x8DC1"'), "0x8DC1");
    assert.equal(parseEtagHeader('W/"abc"'), "abc");
    assert.equal(parseEtagHeader("plain"), "plain");
    for (const missing of [null, "", '""']) {
      assert.throws(
        () => parseEtagHeader(missing),
        (error) => isApiError(error) && error.code === "invalid_response",
      );
    }
  });

  test("an execution's config goes out with snake_case keys", () => {
    assert.deepEqual(toWireExecutionConfig({ definitionVersion: 3 }), { definition_version: 3 });
    assert.deepEqual(toWireExecutionConfig({ mode: "fast", maxItems: 2 }), {
      mode: "fast",
      max_items: 2,
    });
    assert.equal(toWireExecutionConfig(undefined), undefined);
  });
});

describe("project and version parsers", () => {
  const wireProject = {
    id: "p1",
    name: "Architecture decisions",
    description: "",
    run_id: "run_1",
    document_count: 3,
    configuration_version: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-02T10:00:00Z",
  };

  test("a project comes out in the UI's shape; no configuration version is null", () => {
    assert.deepEqual(parseProject(wireProject), {
      id: "p1",
      name: "Architecture decisions",
      description: "",
      runId: "run_1",
      documentCount: 3,
      configurationVersion: null,
      createdAt: "2026-02-01T10:00:00Z",
      updatedAt: "2026-02-02T10:00:00Z",
    });
    assert.equal(
      parseProject({ ...wireProject, configuration_version: 2 }).configurationVersion,
      2,
    );
  });

  test("the list of projects reads its items; a project without a run is invalid", () => {
    assert.equal(parseProjects({ items: [wireProject], next: null }).length, 1);
    assert.throws(
      () => parseProjects({ items: [{ ...wireProject, run_id: 4 }] }),
      isInvalidResponse,
    );
    assert.throws(() => parseProjects([wireProject]), isInvalidResponse);
  });

  test("a page of projects keeps its cursor", () => {
    assert.equal(parseProjectPage({ items: [wireProject], next: "abc" }).next, "abc");
    assert.equal(parseProjectPage({ items: [wireProject], next: null }).next, null);
    assert.throws(() => parseProjectPage({ items: [], next: 4 }), isInvalidResponse);
  });

  test("the list of versions reads its items", () => {
    const versions = parseDefinitionVersions({
      items: [
        {
          version: 2,
          note: "Restored from version 1",
          created_at: "t2",
          record_type_count: 1,
          field_count: 5,
        },
        { version: 1, note: "", created_at: "t1", record_type_count: 1, field_count: 4 },
      ],
    });
    assert.deepEqual(versions[0], {
      version: 2,
      note: "Restored from version 1",
      createdAt: "t2",
      recordTypeCount: 1,
      fieldCount: 5,
    });
    assert.throws(() => parseDefinitionVersions({ items: [{ version: 1 }] }), isInvalidResponse);
  });

  test("run.changed and assistant.cleared are recognised, nothing else is", () => {
    assert.equal(isRunChangedMessage({ type: "run.changed" }), true);
    assert.equal(isRunChangedMessage({ type: "cell" }), false);
    assert.equal(isAssistantClearedMessage({ type: "assistant.cleared" }), true);
    assert.equal(isAssistantClearedMessage({ type: "run.changed" }), false);
  });
});

describe("template parser", () => {
  const wireTemplate = {
    id: "policy-rule",
    name: "Policy rules",
    description: "One rule per record.",
    definition: {
      prompt: "Extract every rule.",
      record_types: [
        {
          id: "rt-rule",
          name: "Rule",
          description: "A rule.",
          fields: [
            {
              id: "f-kind",
              key: "kind",
              name: "Kind",
              description: "",
              mode: "inferred",
              value_type: "choice",
              choices: ["obligation", "permission"],
              multiple: false,
            },
          ],
        },
      ],
      output: { format: "json", template: "" },
    },
  };

  test("a template comes out in the UI's shape, with its definition", () => {
    const [template] = parseTemplates({ items: [wireTemplate], next: null });
    assert.equal(template.id, "policy-rule");
    assert.equal(template.name, "Policy rules");
    assert.equal(template.definition.output.format, "json");
    assert.equal(template.definition.recordTypes[0].fields[0].valueType, "choice");
    assert.deepEqual(template.definition.recordTypes[0].fields[0].choices, [
      "obligation",
      "permission",
    ]);
  });

  test("a template without a definition or with a wrong output format is refused", () => {
    assert.throws(
      () => parseTemplates({ items: [{ ...wireTemplate, definition: undefined }] }),
      isInvalidResponse,
    );
    assert.throws(
      () =>
        parseTemplates({
          items: [
            {
              ...wireTemplate,
              definition: { ...wireTemplate.definition, output: { format: "xml", template: "" } },
            },
          ],
        }),
      isInvalidResponse,
    );
    assert.throws(() => parseTemplates({}), isInvalidResponse);
  });
});

describe("parseBackendStatus", () => {
  test("reads the parts in order and keeps one with an id it does not know", () => {
    const status = parseBackendStatus({
      environment: "local",
      parts: [
        {
          id: "assistant",
          mode: "stub",
          label: "Scripted",
          state: "stub",
          checked_at: null,
          problem: null,
        },
        {
          id: "search_index",
          mode: "real",
          label: "Solr",
          state: "failing",
          checked_at: "2026-11-24T10:00:00Z",
          problem: "timeout",
        },
      ],
    });
    assert.deepEqual(
      status.parts.map((p) => p.id),
      ["assistant", "search_index"],
    );
    assert.equal(status.parts[1].checkedAt, "2026-11-24T10:00:00Z");
    assert.equal(status.parts[1].problem, "timeout");
  });

  test("a mode or state it does not know does not reject the panel", () => {
    const status = parseBackendStatus({
      environment: "local",
      parts: [{ id: "a", mode: "hybrid", label: "A", state: "degraded" }],
    });
    assert.equal(status.parts[0].mode, "real");
    assert.equal(status.parts[0].state, "unknown");
  });

  test("a body that is not a status is rejected", () => {
    assert.throws(() => parseBackendStatus({ environment: "x" }));
  });
});
