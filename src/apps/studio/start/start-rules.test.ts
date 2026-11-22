import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOCK_TEMPLATES } from "@/mocks/templates";
import type { Draft } from "@/features/extraction/definition-draft";
import {
  DEFAULT_SUGGEST_MESSAGE,
  startFromScratch,
  startTemplates,
  suggestMessage,
  templateFieldCount,
} from "./start-rules";

describe("startTemplates", () => {
  test("leaves out the blank template and keeps the order of the others", () => {
    const shown = startTemplates(MOCK_TEMPLATES);
    assert.equal(
      shown.some((t) => t.id === "blank"),
      false,
    );
    assert.deepEqual(
      shown.map((t) => t.id),
      MOCK_TEMPLATES.filter((t) => t.id !== "blank").map((t) => t.id),
    );
    assert.equal(shown.length, MOCK_TEMPLATES.length - 1);
  });
});

describe("templateFieldCount", () => {
  test("counts the fields of the template", () => {
    const byId = (id: string) => MOCK_TEMPLATES.find((t) => t.id === id)!;
    assert.equal(templateFieldCount(byId("skill")), 5);
    assert.equal(templateFieldCount(byId("policy-rule")), 6);
    assert.equal(templateFieldCount(byId("blank")), 0);
  });
});

describe("suggestMessage", () => {
  test("is the default when the text is empty or blank", () => {
    assert.equal(suggestMessage(""), DEFAULT_SUGGEST_MESSAGE);
    assert.equal(suggestMessage("  \n "), DEFAULT_SUGGEST_MESSAGE);
    assert.equal(DEFAULT_SUGGEST_MESSAGE, "Suggest fields for this document.");
  });

  test("is what the person wrote, trimmed", () => {
    assert.equal(suggestMessage("  one record per rule "), "one record per rule");
  });
});

describe("startFromScratch", () => {
  test("adds a record type named Record with one field", () => {
    const empty: Draft = MOCK_TEMPLATES.find((t) => t.id === "blank")!.definition;
    const next = startFromScratch(empty);
    assert.equal(next.recordTypes.length, 1);
    assert.equal(next.recordTypes[0].name, "Record");
    assert.equal(next.recordTypes[0].fields.length, 1);
    assert.equal(empty.recordTypes.length, 0, "the draft it was given is untouched");
  });
});
