import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type {
  ExtractionDefinition,
  ExtractionRecord,
  FieldDef,
  FieldValue,
  RecordType,
  ReviewState,
} from "@/services/contracts";
import { defaultTemplate, recordValues, renderOutput, renderTemplate } from "./output-template";

const field = (key: string, multiple = false): FieldDef => ({
  id: `f_${key}`,
  key,
  name: key.toUpperCase(),
  description: "",
  mode: "quote",
  valueType: "text",
  choices: [],
  multiple,
});

const adr: RecordType = {
  id: "t_adr",
  name: "ADR",
  description: "",
  fields: [field("title"), field("owners", true)],
};
const policy: RecordType = {
  id: "t_pol",
  name: "Policy",
  description: "",
  fields: [field("title"), field("scope")],
};

const value = (
  key: string,
  text: string | null,
  review: ReviewState = "suggested",
): FieldValue => ({
  id: `v_${key}_${text}`,
  fieldId: `f_${key}`,
  value: text,
  spans: [],
  origin: "llm",
  review,
  anchored: true,
});

const record = (
  recordTypeId: string,
  fields: FieldValue[],
  review: ReviewState = "suggested",
): ExtractionRecord => ({
  id: `r_${Math.random()}`,
  fileId: "file_1",
  recordTypeId,
  span: null,
  fields,
  origin: "llm",
  review,
  useAsExample: false,
});

const definition = (
  format: ExtractionDefinition["output"]["format"],
  template = "",
): ExtractionDefinition => ({
  version: 1,
  note: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  prompt: "",
  recordTypes: [adr, policy],
  output: { format, template },
});

describe("recordValues", () => {
  test("single and multiple fields; rejected and null values are left out", () => {
    const r = record("t_adr", [
      value("title", "Use Postgres"),
      value("owners", "Ann"),
      value("owners", "Bo", "accepted"),
      value("owners", "Cy", "rejected"),
      value("owners", null),
    ]);
    assert.deepEqual(recordValues(r, adr), { title: "Use Postgres", owners: ["Ann", "Bo"] });
  });

  test("missing values: null for a single field, empty list for a multiple one", () => {
    assert.deepEqual(recordValues(record("t_adr", [value("title", "x", "rejected")]), adr), {
      title: null,
      owners: [],
    });
  });
});

describe("renderTemplate", () => {
  const values = {
    title: "T",
    owners: ["a", "b", "c"],
    one: ["x"],
    none: [],
    gone: null,
    empty: "",
  };

  test("plain placeholders", () => {
    assert.equal(renderTemplate("# {{title}}!", values), "# T!");
    assert.equal(renderTemplate("{{owners}}", values), "a, b, c");
    assert.equal(renderTemplate("[{{gone}}][{{nope}}][{{ title }}]", values), "[][][T]");
  });

  test("a section over a list renders once per value, with nested text", () => {
    assert.equal(
      renderTemplate("Owners:\n{{#owners}}- {{.}} ({{title}})\n{{/owners}}end", values),
      "Owners:\n- a (T)\n- b (T)\n- c (T)\nend",
    );
  });

  test("a list with zero, one and many values", () => {
    const t = "<{{#owners}}[{{.}}]{{/owners}}>";
    assert.equal(renderTemplate(t, { owners: [] }), "<>");
    assert.equal(renderTemplate(t, { owners: ["a"] }), "<[a]>");
    assert.equal(renderTemplate(t, { owners: ["a", "b"] }), "<[a][b]>");
  });

  test("a section on a single field", () => {
    assert.equal(renderTemplate("{{#title}}Title: {{.}}{{/title}}", values), "Title: T");
    assert.equal(renderTemplate("a{{#gone}}x{{/gone}}b", values), "ab");
    assert.equal(renderTemplate("a{{#empty}}x{{/empty}}b", values), "ab");
  });

  test("unclosed and unknown section tags are left as written", () => {
    assert.equal(renderTemplate("{{#owners}}x", values), "{{#owners}}x");
    assert.equal(renderTemplate("x{{/owners}}", values), "x{{/owners}}");
    assert.equal(renderTemplate("{{#nope}}x{{/nope}}", values), "{{#nope}}x{{/nope}}");
  });

  test("no HTML escaping and no second rendering of values", () => {
    assert.equal(renderTemplate("{{a}}", { a: "<b>&{{a}}" }), "<b>&{{a}}");
  });
});

describe("defaultTemplate", () => {
  test("a heading and one line per field", () => {
    assert.equal(defaultTemplate(adr), "## ADR\n\n**TITLE:** {{title}}\n\n**OWNERS:** {{owners}}");
    assert.equal(defaultTemplate({ ...adr, fields: [] }), "## ADR");
  });
});

describe("renderOutput", () => {
  const records = [
    record("t_adr", [
      value("title", 'Say "hi", ok'),
      value("owners", "Ann"),
      value("owners", "Bo"),
    ]),
    record("t_pol", [value("title", "Line1\nLine2"), value("scope", "all")]),
    record("t_adr", [value("title", "Rejected one")], "rejected"),
    record("t_unknown", [value("title", "skipped")]),
  ];

  test("json", () => {
    assert.deepEqual(JSON.parse(renderOutput(definition("json"), records)), [
      { type: "ADR", title: 'Say "hi", ok', owners: ["Ann", "Bo"] },
      { type: "Policy", title: "Line1\nLine2", scope: "all" },
    ]);
    assert.ok(renderOutput(definition("json"), records).includes("\n  "), "pretty-printed");
  });

  test("markdown", () => {
    const out = renderOutput(definition("markdown", "{{title}} by {{owners}}"), records);
    assert.equal(out, 'Say "hi", ok by Ann, Bo\n\n---\n\nLine1\nLine2 by ');
  });

  test("markdown with a blank template uses each type's default", () => {
    const out = renderOutput(definition("markdown", "  "), records.slice(0, 1));
    assert.equal(out, '## ADR\n\n**TITLE:** Say "hi", ok\n\n**OWNERS:** Ann, Bo');
  });

  test("csv quotes commas, quotes and newlines; union of keys; lists joined with '; '", () => {
    assert.equal(
      renderOutput(definition("csv"), records),
      'type,title,owners,scope\r\nADR,"Say ""hi"", ok",Ann; Bo,\r\nPolicy,"Line1\nLine2",,all',
    );
  });

  test("an empty record list in every format", () => {
    assert.equal(renderOutput(definition("json"), []), "[]");
    assert.equal(renderOutput(definition("markdown", "{{title}}"), []), "");
    assert.equal(renderOutput(definition("csv"), []), "type,title,owners,scope");
  });
});
