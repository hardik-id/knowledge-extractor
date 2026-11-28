import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proposalChanges } from "@/features/extraction/proposal-diff";
import type { ExtractionDefinitionDraft, FieldDef } from "@/services/contracts";
import { MAX_SUGGESTION_LINES, suggestionLines } from "./suggestion-lines";

const field = (id: string, name: string, patch: Partial<FieldDef> = {}): FieldDef => ({
  id,
  key: name.toLowerCase(),
  name,
  description: "",
  mode: "quote",
  valueType: "text",
  choices: [],
  multiple: false,
  ...patch,
});

const def = (
  fields: FieldDef[],
  patch: Partial<ExtractionDefinitionDraft> = {},
): ExtractionDefinitionDraft =>
  ({
    prompt: "",
    recordTypes: [{ id: "t1", name: "ADR", description: "", fields }],
    output: { format: "json", template: "" },
    chunking: { strategy: "auto" },
    ...patch,
  }) as unknown as ExtractionDefinitionDraft;

const lines = (a: ExtractionDefinitionDraft, b: ExtractionDefinitionDraft, max?: number) =>
  suggestionLines(proposalChanges(a, b), a, b, max);

describe("suggestionLines", () => {
  it("says nothing when nothing changes", () => {
    assert.deepEqual(lines(def([field("a", "Title")]), def([field("a", "Title")])), []);
  });

  it("groups added fields under their record type, with at most four names", () => {
    const names = ["Title", "Status", "Date", "Deciders", "Summary"];
    assert.deepEqual(lines(def([]), def(names.map((n) => field(n, n)))), [
      "Add 5 fields to 'ADR': Title, Status, Date, Deciders, ...",
    ]);
    assert.deepEqual(lines(def([]), def([field("a", "Title")])), ["Add 1 field to 'ADR': Title"]);
  });

  it("names the other changes to a field", () => {
    const before = def([field("a", "Status"), field("b", "Owner")]);
    const after = def([field("a", "Status", { valueType: "choice", choices: ["x"] })]);
    assert.deepEqual(lines(before, after), ["Change 'Status' to a choice", "Remove 'Owner'"]);
  });

  it("says how many fields a new record type brings", () => {
    const before = def([]);
    const after = def([]);
    after.recordTypes.push({
      id: "t2",
      name: "Policy",
      description: "",
      fields: [field("p", "Rule"), field("q", "Owner")],
    } as (typeof after.recordTypes)[number]);
    assert.deepEqual(lines(before, after), ["Add record type 'Policy' with 2 fields"]);
  });

  it("names a change to what to extract and to the output", () => {
    const before = def([], { prompt: "a" });
    const after = def([], { prompt: "b", output: { format: "csv", template: "" } });
    assert.deepEqual(lines(before, after), ["Change what to extract", "Change the output format"]);
  });

  it("puts what is added before what is changed before what is removed", () => {
    const before = def([field("a", "Status"), field("b", "Owner")], { prompt: "a" });
    const after = def([field("a", "Status", { mode: "inferred" }), field("c", "Title")], {
      prompt: "b",
    });
    assert.deepEqual(lines(before, after), [
      "Add 1 field to 'ADR': Title",
      "Change 'Status' to worked out by the model",
      "Remove 'Owner'",
      "Change what to extract",
    ]);
  });

  it("shows at most eight lines and counts the rest", () => {
    const before = def(Array.from({ length: 12 }, (_, i) => field(`f${i}`, `Field ${i}`)));
    const result = lines(before, def([]));
    assert.equal(result.length, MAX_SUGGESTION_LINES + 1);
    assert.equal(result.at(-1), "and 4 more");
    assert.equal(lines(before, def([]), 12).length, 12);
  });

  it("keeps markup in a name as the text it is", () => {
    assert.deepEqual(lines(def([]), def([field("a", "<b>x</b>")])), [
      "Add 1 field to 'ADR': <b>x</b>",
    ]);
  });
});
