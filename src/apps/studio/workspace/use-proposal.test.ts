import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  currentOffer,
  currentOutcomes,
  offerProposal,
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
