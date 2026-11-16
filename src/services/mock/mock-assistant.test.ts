import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_EXTRACTION_DEFINITION } from "@/mocks/extraction";
import type { ExtractionDefinitionDraft } from "../contracts";
import { assistantReply, keyFromName } from "./mock-assistant";

let counter = 0;
const options = { newId: () => `id-${++counter}` };

const bare = (prompt = ""): ExtractionDefinitionDraft => ({
  prompt,
  recordTypes: [],
  output: { format: "markdown", template: "" },
});
const adr = () => structuredClone(DEFAULT_EXTRACTION_DEFINITION);
const reply = (text: string, definition = adr()) => assistantReply(text, definition, options);

function proposed(text: string, definition = adr()) {
  const result = reply(text, definition);
  assert.ok(result.proposal, `expected a proposal for "${text}": ${result.text}`);
  return result.proposal;
}

function assertValid(definition: ExtractionDefinitionDraft) {
  assert.ok(definition.recordTypes.length > 0);
  for (const rt of definition.recordTypes) {
    const keys = rt.fields.map((f) => f.key);
    assert.ok(keys.every(Boolean), "keys are not empty");
    assert.equal(new Set(keys).size, keys.length, "keys are unique");
    for (const f of rt.fields) {
      assert.equal(f.key, keyFromName(f.key), "keys are in key form");
      if (f.valueType === "choice") assert.ok(f.choices.length > 0);
    }
    const ids = rt.fields.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
  }
}

const fields = (d: ExtractionDefinitionDraft) => d.recordTypes[0].fields;
const field = (d: ExtractionDefinitionDraft, key: string) => fields(d).find((f) => f.key === key)!;

describe("assistantReply: a bare prompt", () => {
  test("ADR gives the ADR record type and its template, with fresh ids", () => {
    const { definition, reasons } = proposed("Extract all ADRs", bare());
    assert.equal(definition.recordTypes[0].name, "ADR");
    assert.equal(definition.output.template, DEFAULT_EXTRACTION_DEFINITION.output.template);
    assert.notEqual(definition.recordTypes[0].id, DEFAULT_EXTRACTION_DEFINITION.recordTypes[0].id);
    assert.ok(reasons.length > 1);
    assertValid(definition);
  });

  test("the definition's own prompt is used when the message has no keyword", () => {
    const { definition } = proposed("help me start", bare("Find architecture decision records"));
    assert.equal(definition.recordTypes[0].name, "ADR");
    assert.equal(definition.prompt, "Find architecture decision records");
  });

  test("policy wording gives a Requirement with quote fields, and says why", () => {
    const result = reply("Extract the policy requirements, suppliers must comply", bare());
    const { definition } = result.proposal!;
    const rt = definition.recordTypes[0];
    assert.equal(rt.name, "Requirement");
    assert.deepEqual(
      rt.fields.map((f) => [f.key, f.mode]),
      [
        ["requirement", "quote"],
        ["applies_to", "quote"],
        ["category", "inferred"],
      ],
    );
    assert.equal(rt.fields[2].valueType, "choice");
    assert.match(result.text, /exact quotes/);
    assert.match(result.text, /must not be reworded/);
    assert.match(definition.output.template, /\{\{requirement\}\}/);
    assertValid(definition);
  });

  test("anything else gets a generic record type named after the main noun", () => {
    const { definition } = proposed("Find all invoices in these files", bare());
    const rt = definition.recordTypes[0];
    assert.equal(rt.name, "Invoice");
    assert.deepEqual(
      rt.fields.map((f) => [f.key, f.mode]),
      [
        ["title", "quote"],
        ["summary", "inferred"],
      ],
    );
    assert.match(definition.output.template, /\{\{title\}\}/);
    assert.match(definition.output.template, /\{\{summary\}\}/);
    assertValid(definition);
  });

  test("falls back to Item", () => {
    assert.equal(proposed("hello", bare()).definition.recordTypes[0].name, "Item");
  });
});

describe("assistantReply: refinements", () => {
  test("add a field: quote by default, in the template, key derived", () => {
    const { definition, reasons } = proposed("Add a field for approval date");
    const added = field(definition, "approval_date");
    assert.equal(added.name, "Approval date");
    assert.equal(added.mode, "quote");
    assert.equal(added.valueType, "date");
    assert.match(definition.output.template, /\{\{approval_date\}\}/);
    assert.deepEqual(reasons[0].path, "ADR / Approval date");
    assertValid(definition);
  });

  test("add as inferred, and the key stays unique", () => {
    const { definition } = proposed("add title 2 as inferred");
    assert.equal(field(definition, "title_2").mode, "inferred");
    const again = proposed("add summary, summarise it");
    assert.equal(field(again.definition, "summary").mode, "inferred");
  });

  test("add a field that exists is not a proposal", () => {
    assert.equal(reply("add a field for title").proposal, null);
  });

  test("add does not touch the template when the format is not markdown", () => {
    const definition = adr();
    definition.output.format = "json";
    const { definition: next } = proposed("add owner", definition);
    assert.equal(next.output.template, definition.output.template);
  });

  test("remove / drop, also from the template", () => {
    const { definition } = proposed("Drop the context field");
    assert.equal(
      fields(definition).some((f) => f.key === "context"),
      false,
    );
    assert.doesNotMatch(definition.output.template, /\{\{context\}\}/);
    assert.match(definition.output.template, /\{\{decision\}\}/);
    assertValid(definition);
  });

  test("remove by key, and an unknown field is explained", () => {
    assert.ok(proposed("remove decided_on").definition.recordTypes[0].fields.length === 5);
    const none = reply("remove colour");
    assert.equal(none.proposal, null);
    assert.match(none.text, /Title/);
  });

  test("make exact / inferred", () => {
    assert.equal(field(proposed("make status exact").definition, "status").mode, "quote");
    assert.equal(field(proposed("Make the title inferred").definition, "title").mode, "inferred");
    assert.equal(
      field(proposed("make approved by verbatim").definition, "approved_by").mode,
      "quote",
    );
  });

  test("rename keeps the key", () => {
    const { definition } = proposed("rename decided on to Decision date");
    const renamed = field(definition, "decided_on");
    assert.equal(renamed.name, "Decision date");
  });

  test("split approver and approval date replaces Approved by", () => {
    const { definition, reasons } = proposed("split approver and approval date");
    const keys = fields(definition).map((f) => f.key);
    assert.equal(keys.includes("approved_by"), false);
    assert.ok(keys.includes("approver"));
    assert.ok(keys.includes("approval_date"));
    assert.equal(field(definition, "approver").multiple, true);
    assert.equal(field(definition, "approval_date").valueType, "date");
    assert.match(definition.output.template, /\{\{approval_date\}\}/);
    assert.doesNotMatch(definition.output.template, /approved_by/);
    assert.equal(reasons.length, 3);
    assertValid(definition);
  });

  test("split with nothing to replace adds two fields", () => {
    const { definition } = proposed("split owner and deadline");
    assert.equal(fields(definition).length, 8);
  });

  test("several values", () => {
    const { definition } = proposed("Decision can have several values");
    assert.equal(field(definition, "decision").multiple, true);
    assert.match(definition.output.template, /\{\{#decision\}\}/);
  });

  test("output format", () => {
    assert.equal(proposed("output as json").definition.output.format, "json");
    assert.equal(proposed("Export as CSV please").definition.output.format, "csv");
    const json = adr();
    json.output = { format: "json", template: "" };
    const md = proposed("output as markdown", json).definition.output;
    assert.equal(md.format, "markdown");
    assert.match(md.template, /\{\{title\}\}/);
  });

  test("use a field in the template", () => {
    const definition = adr();
    definition.output.template = "## {{title}}\n";
    const { definition: next } = proposed("use status in the template", definition);
    assert.match(next.output.template, /\{\{status\}\}/);
    assert.equal(reply("use title in the template", definition).proposal, null);
  });

  test("a named record type is the target", () => {
    const definition = adr();
    definition.recordTypes.push({
      id: "rt-2",
      name: "Risk",
      description: "",
      fields: [],
    });
    const { definition: next } = proposed("add a field for severity to Risk", definition);
    assert.deepEqual(
      next.recordTypes[1].fields.map((f) => f.key),
      ["severity"],
    );
  });

  test("the input is not changed", () => {
    const definition = adr();
    reply("drop context", definition);
    assert.deepEqual(definition, DEFAULT_EXTRACTION_DEFINITION);
  });
});

describe("assistantReply: no match", () => {
  test("says what it can do with two examples and proposes nothing", () => {
    const result = reply("what is the weather");
    assert.equal(result.proposal, null);
    assert.match(result.text, /add a field for approval date/);
    assert.match(result.text, /make approved by exact/);
  });
});
