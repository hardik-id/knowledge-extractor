import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOCK_TEMPLATES } from "@/mocks/templates";
import { templateFact } from "./template-facts";

const fact = (id: string) => templateFact(MOCK_TEMPLATES.find((t) => t.id === id)!.definition);

describe("templateFact", () => {
  test("names the record type, counts its fields and gives the output format", () => {
    assert.equal(fact("skill"), "Skill · 5 fields · Markdown");
    assert.equal(fact("policy-rule"), "Rule · 6 fields · JSON");
  });

  test("a template with nothing in it says so", () => {
    assert.equal(fact("blank"), "Starts empty · Markdown");
  });

  test("several record types are counted, a single field is singular", () => {
    const [one] = MOCK_TEMPLATES;
    const [type] = one.definition.recordTypes;
    const many = {
      ...one.definition,
      recordTypes: [type, { ...type, fields: type.fields.slice(0, 1) }],
    };
    assert.equal(
      templateFact(many),
      `2 record types · ${type.fields.length + 1} fields · Markdown`,
    );
    assert.equal(
      templateFact({
        ...one.definition,
        recordTypes: [{ ...type, fields: type.fields.slice(0, 1) }],
      }),
      "ADR · 1 field · Markdown",
    );
  });
});
