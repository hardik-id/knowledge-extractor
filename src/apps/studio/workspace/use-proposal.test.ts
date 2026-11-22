import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  currentDecisions,
  currentOffer,
  currentOutcomes,
  NOT_SEEN,
  offerProposal,
  offerStep,
  openChanges,
  outcomeLine,
  recordDecision,
  resetOutcomes,
  setOutcome,
  type ProposalOffer,
} from "./use-proposal";

describe("the outcomes of proposals", () => {
  afterEach(() => resetOutcomes());

  test("remembers what became of each proposal", () => {
    setOutcome("m1", "applied");
    setOutcome("m2", "dismissed");
    assert.deepEqual(currentOutcomes(), { m1: "applied", m2: "dismissed" });
  });

  test("a new outcome does not change the earlier object", () => {
    setOutcome("m1", "applied");
    const before = currentOutcomes();
    setOutcome("m2", "applied");
    assert.deepEqual(before, { m1: "applied" });
  });

  test("clearing the conversation forgets them all", () => {
    setOutcome("m1", "applied");
    resetOutcomes();
    assert.deepEqual(currentOutcomes(), {});
  });
});

describe("an offered proposal", () => {
  afterEach(() => offerProposal(null));

  const offer = (id: string): ProposalOffer => ({
    id,
    proposal: {
      definition: { prompt: "", recordTypes: [], output: { format: "markdown", template: "" } },
      reasons: [],
    },
  });

  test("there is none to begin with", () => {
    assert.equal(currentOffer(), null);
  });

  test("the newest offer replaces the one before", () => {
    const first = offer("template:adr");
    const second = offer("template:policy");
    offerProposal(first);
    assert.equal(currentOffer(), first);
    offerProposal(second);
    assert.equal(currentOffer(), second);
  });

  test("it can be taken back, and that leaves the outcomes of messages alone", () => {
    setOutcome("m1", "applied");
    offerProposal(offer("template:adr"));
    offerProposal(null);
    assert.equal(currentOffer(), null);
    assert.deepEqual(currentOutcomes(), { m1: "applied" });
    resetOutcomes();
  });

  test("clearing the conversation keeps the offer", () => {
    const one = offer("template:adr");
    offerProposal(one);
    resetOutcomes();
    assert.equal(currentOffer(), one);
  });
});

describe("an offer gives way to a newer proposal of the assistant", () => {
  test("the first look with the conversation loaded only notes the newest proposal", () => {
    assert.deepEqual(offerStep(NOT_SEEN, "m5"), { withdraw: false, baseline: "m5" });
    assert.deepEqual(offerStep(NOT_SEEN, undefined), { withdraw: false, baseline: undefined });
  });

  test("the same newest proposal leaves the offer standing", () => {
    assert.deepEqual(offerStep("m5", "m5"), { withdraw: false, baseline: "m5" });
  });

  test("a proposal that arrives after the offer replaces it", () => {
    assert.equal(offerStep("m5", "m6").withdraw, true);
  });

  test("the first proposal of an empty conversation replaces it too", () => {
    const noted = offerStep(NOT_SEEN, undefined);
    assert.equal(offerStep(noted.baseline, "m1").withdraw, true);
  });

  test("clearing the conversation replaces nothing, and the next proposal is new again", () => {
    const cleared = offerStep("m5", undefined);
    assert.deepEqual(cleared, { withdraw: false, baseline: undefined });
    assert.equal(offerStep(cleared.baseline, "m9").withdraw, true);
  });
});

describe("decisions one change at a time", () => {
  afterEach(() => resetOutcomes());
  const change = (text: string) => ({
    kind: "changed-field" as const,
    typeId: "t1",
    fieldId: "f1",
    text,
  });
  const key = (text: string) => ["changed-field", "t1", "f1", text].join("\u0000");

  test("counts what was kept and remembers what was discarded", () => {
    recordDecision("m1", { kept: 1 });
    recordDecision("m1", { discarded: [key("b")] });
    assert.deepEqual(currentDecisions().m1, { kept: 1, discarded: [key("b")], whole: false });
  });

  test("a discarded change stays out of what is open, wherever it now stands", () => {
    recordDecision("m1", { discarded: [key("b")] });
    const open = openChanges([change("c"), change("b"), change("a")], currentDecisions().m1);
    assert.deepEqual(
      open.map((c) => c.text),
      ["c", "a"],
    );
    assert.equal(openChanges([change("a")], undefined).length, 1);
  });

  test("clearing the conversation forgets them", () => {
    recordDecision("m1", { kept: 1 });
    resetOutcomes();
    assert.deepEqual(currentDecisions(), {});
  });

  test("an offer shown again starts afresh", () => {
    const offer: ProposalOffer = {
      id: "template:adr",
      proposal: {
        definition: { prompt: "", recordTypes: [], output: { format: "markdown", template: "" } },
        reasons: [],
      },
    };
    recordDecision("template:adr", { kept: 2 });
    offerProposal(offer);
    assert.equal(currentDecisions()["template:adr"], undefined);
    offerProposal(null);
  });

  test("the line says what became of the changes", () => {
    assert.equal(outcomeLine("open", undefined, 2), "Waiting for you");
    assert.equal(outcomeLine("applied", undefined, 0), "Kept");
    assert.equal(outcomeLine("dismissed", undefined, 0), "Discarded");
    assert.equal(outcomeLine("replaced", undefined, 0), "Replaced");
    assert.equal(outcomeLine("included", undefined, 0), "Already in what you have");
    assert.equal(outcomeLine("applied", { kept: 1, discarded: [], whole: false }, 0), "1 kept");
    assert.equal(
      outcomeLine("applied", { kept: 2, discarded: ["x"], whole: false }, 0),
      "2 kept, 1 discarded",
    );
    assert.equal(
      outcomeLine("open", { kept: 1, discarded: [], whole: false }, 1),
      "1 kept, 1 waiting",
    );
    assert.equal(outcomeLine("applied", { kept: 3, discarded: [], whole: true }, 0), "Kept");
  });
});
