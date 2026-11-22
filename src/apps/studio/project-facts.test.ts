import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { configurationFact, deletionConsequences, documentsFact } from "./project-facts";

describe("project facts", () => {
  test("the facts read as sentences", () => {
    assert.equal(documentsFact({ documentCount: 1 }), "1 document");
    assert.equal(documentsFact({ documentCount: 0 }), "0 documents");
    assert.equal(configurationFact({ configurationVersion: null }), "No configuration yet");
    assert.equal(configurationFact({ configurationVersion: 3 }), "Configuration version 3");
  });

  test("the deletion names documents, configuration, conversation and records", () => {
    const text = deletionConsequences({ documentCount: 2, configurationVersion: 1 }).join("|");
    assert.match(text, /2 documents/);
    assert.match(text, /configuration/i);
    assert.match(text, /conversation/i);
    assert.match(text, /records/i);
  });
});
