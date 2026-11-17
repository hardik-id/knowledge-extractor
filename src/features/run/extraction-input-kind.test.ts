import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOCK_DOCUMENTS } from "@/mocks/documents";
import { MOCK_FILES } from "@/mocks/files";
import { extractionInputKind } from "./extraction-input-kind";

describe("extractionInputKind", () => {
  test("a storage document is read as it is", () => {
    assert.equal(extractionInputKind(MOCK_DOCUMENTS[0]), "document");
  });

  test("any other file is read from the enrich output", () => {
    for (const file of MOCK_FILES) assert.equal(extractionInputKind(file), "enrich");
  });
});
