import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtractionDefinitionDraft, FieldDef } from "@/services/contracts";
import {
  applyChange,
  applyChanges,
  changeKey,
  diffProposal,
  proposalChanges,
  shownOutcome,
} from "./proposal-diff";

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
  chunking: { strategy: "auto" as const, size: null },
});

describe("diffProposal", () => {
  it("gives nothing when nothing changed", () => {
    assert.deepEqual(diffProposal(base(), structuredClone(base())), []);
  });

  it("does not count chunking: a proposal never changes it, and keeping all leaves the draft's own", () => {
    const p = base();
    p.chunking = { strategy: "heading", size: 4000 };
    assert.deepEqual(diffProposal(base(), p), []);
    p.prompt = "Find all decisions";
    const mine = { ...base(), chunking: { strategy: "fixed" as const, size: 2000 } };
    const kept = applyChanges(mine, p, proposalChanges(mine, p));
    assert.equal(kept.prompt, "Find all decisions");
    assert.deepEqual(kept.chunking, { strategy: "fixed", size: 2000 });
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

describe("proposalChanges", () => {
  it("gives nothing when nothing changed", () => {
    assert.deepEqual(proposalChanges(base(), structuredClone(base())), []);
  });

  it("names the kind, the type and the field of each change", () => {
    const p = base();
    p.prompt = "Find all decisions";
    p.output = { format: "markdown", template: "# {{title}}" };
    p.recordTypes[0]!.fields = [
      field("f1", "title", "Title", { mode: "inferred" }),
      field("f3", "owner", "Owner"),
    ];
    p.recordTypes.push({ id: "t2", name: "Risk", description: "", fields: [] });
    assert.deepEqual(proposalChanges(base(), p), [
      { kind: "prompt", typeId: null, fieldId: null, text: "Prompt changed" },
      { kind: "added-type", typeId: "t2", fieldId: null, text: "Record type added: Risk" },
      { kind: "added-field", typeId: "t1", fieldId: "f3", text: "ADR: field added: Owner" },
      { kind: "removed-field", typeId: "t1", fieldId: "f2", text: "ADR: field removed: Approver" },
      {
        kind: "changed-field",
        typeId: "t1",
        fieldId: "f1",
        text: "ADR / Title: now worked out by the model",
      },
      {
        kind: "output",
        typeId: null,
        fieldId: null,
        text: "Output format changed to Markdown",
      },
      { kind: "output", typeId: null, fieldId: null, text: "Template changed" },
    ]);
  });

  it("reports a record type rename and description change as changed-type", () => {
    const p = base();
    p.recordTypes[0]!.name = "Decision";
    p.recordTypes[0]!.description = "A choice made";
    assert.deepEqual(proposalChanges(base(), p), [
      {
        kind: "changed-type",
        typeId: "t1",
        fieldId: null,
        part: "name",
        text: "Record type renamed: ADR to Decision",
      },
      {
        kind: "changed-type",
        typeId: "t1",
        fieldId: null,
        part: "description",
        text: "Decision: description changed",
      },
    ]);
  });

  it("names a removed record type", () => {
    const p = base();
    p.recordTypes = [];
    assert.deepEqual(proposalChanges(base(), p), [
      { kind: "removed-type", typeId: "t1", fieldId: null, text: "Record type removed: ADR" },
    ]);
  });

  it("is what diffProposal says, in words", () => {
    const p = base();
    p.prompt = "Other";
    p.recordTypes[0]!.fields.pop();
    assert.deepEqual(
      diffProposal(base(), p),
      proposalChanges(base(), p).map((c) => c.text),
    );
  });
});

/** A proposal that changes every kind of thing. */
function everything(): ExtractionDefinitionDraft {
  const p = base();
  p.prompt = "Find all decisions";
  p.output = { format: "markdown", template: "# {{title}}" };
  p.recordTypes[0]!.name = "Decision";
  p.recordTypes[0]!.description = "A choice made";
  p.recordTypes[0]!.fields = [
    field("f0", "owner", "Owner"),
    field("f1", "title", "Titel", {
      mode: "inferred",
      valueType: "choice",
      choices: ["a", "b"],
      multiple: true,
      description: "The title",
    }),
  ];
  p.recordTypes.push({
    id: "t2",
    name: "Risk",
    description: "",
    fields: [field("r1", "risk", "Risk")],
  });
  return p;
}

describe("applyChange", () => {
  const find = (p: ExtractionDefinitionDraft, kind: string, text?: RegExp) =>
    proposalChanges(base(), p).find((c) => c.kind === kind && (!text || text.test(c.text)))!;

  it("puts in the prompt alone", () => {
    const p = everything();
    const d = applyChange(base(), p, find(p, "prompt"));
    assert.equal(d.prompt, "Find all decisions");
    assert.deepEqual({ ...d, prompt: "Find decisions" }, base());
  });

  it("puts in the format and the template separately", () => {
    const p = everything();
    const d = applyChange(base(), p, find(p, "output", /format/));
    assert.deepEqual(d.output, { format: "markdown", template: "" });
    const e = applyChange(base(), p, find(p, "output", /Template/));
    assert.deepEqual(e.output, { format: "json", template: "# {{title}}" });
  });

  it("adds a record type with its fields, and removes one", () => {
    const p = everything();
    const added = applyChange(base(), p, find(p, "added-type"));
    assert.deepEqual(
      added.recordTypes.map((t) => t.name),
      ["ADR", "Risk"],
    );
    assert.equal(added.recordTypes[1]!.fields.length, 1);
    const gone = base();
    const none = { ...base(), recordTypes: [] };
    const removed = applyChange(gone, none, proposalChanges(gone, none)[0]!);
    assert.deepEqual(removed.recordTypes, []);
  });

  it("renames a record type and changes its description separately", () => {
    const p = everything();
    const renamed = applyChange(base(), p, find(p, "changed-type", /renamed/));
    assert.equal(renamed.recordTypes[0]!.name, "Decision");
    assert.equal(renamed.recordTypes[0]!.description, "");
    const described = applyChange(base(), p, find(p, "changed-type", /description/));
    assert.equal(described.recordTypes[0]!.name, "ADR");
    assert.equal(described.recordTypes[0]!.description, "A choice made");
  });

  it("adds a field where the proposal has it, and removes one", () => {
    const p = everything();
    const added = applyChange(base(), p, find(p, "added-field"));
    assert.deepEqual(
      added.recordTypes[0]!.fields.map((f) => f.id),
      ["f0", "f1", "f2"],
    );
    const removed = applyChange(base(), p, find(p, "removed-field"));
    assert.deepEqual(
      removed.recordTypes[0]!.fields.map((f) => f.id),
      ["f1"],
    );
  });

  it("changes one thing of a field", () => {
    const p = everything();
    const d = applyChange(base(), p, find(p, "changed-field", /now worked out/));
    const f = d.recordTypes[0]!.fields[0]!;
    assert.equal(f.mode, "inferred");
    assert.equal(f.name, "Title");
    assert.equal(f.multiple, false);
    const r = applyChange(base(), p, find(p, "changed-field", /renamed/));
    assert.equal(r.recordTypes[0]!.fields[0]!.name, "Titel");
    assert.equal(r.recordTypes[0]!.fields[0]!.mode, "quote");
  });

  it("keeping every change one after the other ends with the proposal", () => {
    for (const p of [everything(), { ...base(), recordTypes: [] }]) {
      let draft = base();
      for (let guard = 0; guard < 30; guard++) {
        const changes = proposalChanges(draft, p);
        if (changes.length === 0) break;
        draft = applyChange(draft, p, changes[0]!);
      }
      assert.deepEqual(draft, p);
    }
  });

  it("keeping the last change first gives the same end", () => {
    const p = everything();
    let draft = base();
    for (let guard = 0; guard < 30; guard++) {
      const changes = proposalChanges(draft, p);
      if (changes.length === 0) break;
      draft = applyChange(draft, p, changes[changes.length - 1]!);
    }
    assert.deepEqual(draft, p);
  });

  it("leaves the draft as it is for a change that is not there", () => {
    const p = everything();
    const ghost = { kind: "added-field", typeId: "t1", fieldId: "zz", text: "x" } as const;
    assert.deepEqual(applyChange(base(), p, ghost), base());
  });

  it("discarding every change leaves the draft unchanged, and a discarded one stays out after another is kept", () => {
    const p = everything();
    const all = proposalChanges(base(), p);
    const discarded = new Set([changeKey(all[0]!)]);
    const draft = applyChange(base(), p, all[1]!);
    const open = proposalChanges(draft, p).filter((c) => !discarded.has(changeKey(c)));
    assert.equal(open.length, all.length - 2);
    assert.ok(!open.some((c) => c.kind === "prompt"));
  });
});

describe("changeKey", () => {
  it("is the same for the same change worked out against another draft", () => {
    const p = everything();
    const before = proposalChanges(base(), p);
    const after = proposalChanges(applyChange(base(), p, before[0]!), p);
    const keys = new Set(before.map(changeKey));
    assert.ok(after.every((c) => keys.has(changeKey(c))));
    assert.equal(new Set(before.map(changeKey)).size, before.length);
  });
});

describe("applyChanges", () => {
  it("applies many added fields at once, fast", () => {
    const proposal = base();
    for (let i = 0; i < 1000; i++)
      proposal.recordTypes[0]!.fields.push(field(`n${i}`, `k${i}`, `New ${i}`));
    const changes = proposalChanges(base(), proposal);
    const started = Date.now();
    const result = applyChanges(base(), proposal, changes);
    assert.ok(Date.now() - started < 2000);
    assert.equal(result.recordTypes[0]!.fields.length, 1002);
  });

  it("leaves out the changes not passed", () => {
    const proposal = base();
    proposal.prompt = "New prompt";
    proposal.recordTypes[0]!.fields.push(field("n1", "k1", "Extra"));
    const [prompt, added] = proposalChanges(base(), proposal);
    const only = applyChanges(base(), proposal, [added!]);
    assert.equal(only.prompt, "Find decisions");
    assert.equal(only.recordTypes[0]!.fields.length, 3);
    assert.equal(applyChanges(base(), proposal, [prompt!]).prompt, "New prompt");
  });

  it("does not read a description change as a rename from the type's name", () => {
    const current = base();
    current.recordTypes[0]!.description = "old";
    const proposal = structuredClone(current);
    proposal.recordTypes[0]!.name = "Record type renamed X";
    proposal.recordTypes[0]!.description = "new";
    const description = proposalChanges(current, proposal).find((c) => c.part === "description")!;
    const result = applyChange(current, proposal, description);
    assert.equal(result.recordTypes[0]!.name, "ADR");
    assert.equal(result.recordTypes[0]!.description, "new");
  });
});
