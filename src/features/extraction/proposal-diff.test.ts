import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionDefinitionDraft, FieldDef } from "@/services/contracts";
import { diffProposal, shownOutcome } from "./proposal-diff";

const field = (id: string, key: string, name: string, over: Partial<FieldDef> = {}): FieldDef => ({
  id,
  key,
  name,
  description: "",
  mode: "quote",
  valueType: "text",
  choices: [],
  multiple: false,
  ...over,
});

const base = (): ExtractionDefinitionDraft => ({
  prompt: "Find decisions",
  recordTypes: [
    {
      id: "t1",
      name: "ADR",
      description: "",
      fields: [field("f1", "title", "Title"), field("f2", "approver", "Approver")],
    },
  ],
  output: { format: "json", template: "" },
});

describe("diffProposal", () => {
  it("gives nothing when nothing changed", () => {
    assert.deepEqual(diffProposal(base(), structuredClone(base())), []);
  });

  it("sees a changed prompt, format and template", () => {
    const p = base();
    p.prompt = "Find all decisions";
    p.output = { format: "markdown", template: "# {{title}}" };
    assert.deepEqual(diffProposal(base(), p), [
      "Prompt changed",
      "Output format changed to Markdown",
      "Template changed",
    ]);
  });

  it("sees record types added and removed", () => {
    const p = base();
    p.recordTypes = [{ id: "t9", name: "Risk", description: "", fields: [] }];
    assert.deepEqual(diffProposal(base(), p), [
      "Record type added: Risk",
      "Record type removed: ADR",
    ]);
  });

  it("matches a record type by id and sees a rename", () => {
    const p = base();
    p.recordTypes[0]!.name = "Decision";
    assert.deepEqual(diffProposal(base(), p), ["Record type renamed: ADR to Decision"]);
  });

  it("matches by name when the assistant issues new ids", () => {
    const p = base();
    p.recordTypes[0]!.id = "new-t";
    p.recordTypes[0]!.fields = p.recordTypes[0]!.fields.map((f) => ({ ...f, id: `new-${f.id}` }));
    assert.deepEqual(diffProposal(base(), p), []);
  });

  it("sees fields added, removed and changed", () => {
    const p = base();
    const t = p.recordTypes[0]!;
    t.fields = [
      field("f1", "title", "Title", { mode: "inferred", multiple: true }),
      field("f3", "date", "Decided on", { valueType: "date" }),
    ];
    assert.deepEqual(diffProposal(base(), p), [
      "ADR: field added: Decided on",
      "ADR: field removed: Approver",
      "ADR / Title: now worked out by the model",
      "ADR / Title: now takes several values",
    ]);
  });

  it("sees a field rename and a type change", () => {
    const p = base();
    p.recordTypes[0]!.fields[1] = field("f2", "approver", "Approved by", { valueType: "choice" });
    assert.deepEqual(diffProposal(base(), p), [
      "ADR: field “Approver” renamed to “Approved by”",
      "ADR / Approved by: type changed to choice",
    ]);
  });
});

describe("shownOutcome", () => {
  it("keeps an open proposal open while it would change something", () => {
    assert.equal(shownOutcome("open", 2), "open");
  });

  it("shows an open proposal that changes nothing as already included", () => {
    // Applied before a reload: the draft already is the proposal.
    assert.equal(shownOutcome("open", 0), "included");
  });

  it("keeps what the person did, and replaced proposals, as they are", () => {
    assert.equal(shownOutcome("applied", 0), "applied");
    assert.equal(shownOutcome("dismissed", 3), "dismissed");
    assert.equal(shownOutcome("replaced", 0), "replaced");
  });
});
