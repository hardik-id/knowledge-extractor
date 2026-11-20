import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_DEFINITION_NOTE_LENGTH } from "@/services/contracts";
import { keptSuggestedNote, noteForSave, templateNote } from "./template-note";

describe("templateNote", () => {
  test("names the template", () => {
    assert.equal(templateNote("Policy rules"), "From template: Policy rules");
  });
  test("fits the note limit", () => {
    assert.equal(templateNote("x".repeat(500)).length, MAX_DEFINITION_NOTE_LENGTH);
  });
});

describe("keptSuggestedNote", () => {
  test("lasts while the draft differs from the saved version", () => {
    assert.equal(keptSuggestedNote("From template: A", true), "From template: A");
  });
  test("is dropped once the draft is back to the saved version", () => {
    assert.equal(keptSuggestedNote("From template: A", false), "");
  });
});

describe("noteForSave", () => {
  test("a typed note wins over the suggestion", () => {
    assert.equal(noteForSave("mine", "From template: A"), "mine");
  });
  test("without a typed note (a run's auto-save passes none) the suggestion is used", () => {
    assert.equal(noteForSave(undefined, "From template: A"), "From template: A");
  });
  test("a typed blank note means no note, even with a suggestion", () => {
    assert.equal(noteForSave("  ", "From template: A"), undefined);
  });
  test("no note and no suggestion saves without one", () => {
    assert.equal(noteForSave(undefined, ""), undefined);
  });
});
