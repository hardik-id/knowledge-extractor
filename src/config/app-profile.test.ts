import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STAGE_IDS } from "@/types/pipeline";
import { APP_MODES } from "./env";
import { profileFor } from "./app-profile";

describe("app profiles", () => {
  for (const mode of APP_MODES) {
    describe(mode, () => {
      const profile = profileFor(mode);

      test("starts with select", () => {
        assert.equal(profile.stages[0], "select");
      });

      test("stages are known and keep the run order", () => {
        const indexes = profile.stages.map((id) => STAGE_IDS.indexOf(id));
        assert.ok(indexes.every((i) => i >= 0));
        assert.deepEqual(
          indexes,
          [...indexes].sort((a, b) => a - b),
        );
        assert.equal(new Set(profile.stages).size, profile.stages.length);
      });

      test("has at least one source and a storage prefix", () => {
        assert.ok(profile.sources.length > 0);
        assert.ok(profile.storagePrefix.length > 0);
      });
    });
  }

  test("pipeline has every stage and today's storage prefix", () => {
    const profile = profileFor("pipeline");
    assert.deepEqual(profile.stages, STAGE_IDS);
    assert.equal(profile.storagePrefix, "knowledge-extractor");
  });

  test("studio selects documents from storage and extracts from them", () => {
    const studio = profileFor("studio");
    assert.deepEqual(studio.stages, ["select", "extract"]);
    assert.deepEqual(studio.sources, ["storage"]);
    assert.equal(studio.extractionInput, "document");
    assert.notEqual(studio.storagePrefix, profileFor("pipeline").storagePrefix);
    assert.notEqual(studio.shortName, profileFor("pipeline").shortName);
  });

  test("pipeline keeps its extraction input and wording", () => {
    const pipeline = profileFor("pipeline");
    assert.equal(pipeline.extractionInput, "enrich");
    assert.equal(pipeline.shortName, "KX");
    assert.equal(pipeline.itemNoun, "file");
  });
});
