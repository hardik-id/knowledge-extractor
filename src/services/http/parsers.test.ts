import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isApiError } from "@/lib/api/api-error";
import {
  parseAssistantEventMessage,
  parseAssistantMessage,
  parseAssistantMessages,
  parseCellMessage,
  parseDefinition,
  parseExecution,
  parseExtractionChangedMessage,
  parseFileExtraction,
  parsePublishResult,
  parseRun,
  parseSourceFiles,
  toWireDefinition,
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
    assert.equal(d.output.format, "markdown");
    const [status, owners] = d.recordTypes[0].fields;
    assert.equal(status.valueType, "choice");
    assert.deepEqual(status.choices, ["accepted", "rejected"]);
    assert.deepEqual(owners.choices, []);
    assert.equal(owners.multiple, true);
  });

  test("toWireDefinition is the inverse of parseDefinition", () => {
    const { version, ...draft } = parseDefinition(wireDefinition);
    assert.equal(version, 3);
    const wire = toWireDefinition(draft);
    assert.ok(!("version" in wire));
    assert.deepEqual(parseDefinition({ version: 3, ...wire }), parseDefinition(wireDefinition));
    assert.equal(wire.record_types[0].fields[0].value_type, "choice");
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
