import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { extractionHref, projectHref, projectIdFromPath, studioSteps } from "./nav-steps";

describe("studio addresses", () => {
  test("a project's two steps live under its id", () => {
    assert.equal(projectHref("p1"), "/studio/projects/p1");
    assert.equal(extractionHref("p1"), "/studio/projects/p1/extract");
    assert.equal(projectHref("a b/c"), "/studio/projects/a%20b%2Fc");
  });

  test("the project id is read back from the address", () => {
    assert.equal(projectIdFromPath("/studio/projects/p1"), "p1");
    assert.equal(projectIdFromPath("/studio/projects/p1/extract"), "p1");
    assert.equal(projectIdFromPath(projectHref("a b/c")), "a b/c");
    assert.equal(projectIdFromPath("/studio"), null);
    assert.equal(projectIdFromPath("/studio/projects"), null);
    assert.equal(projectIdFromPath("/studio/extract"), null);
  });
});

describe("studioSteps", () => {
  test("marks the step the path belongs to, with the project's addresses", () => {
    const onDocuments = studioSteps("/studio/projects/p1", true);
    assert.deepEqual(
      onDocuments.map((s) => s.href),
      ["/studio/projects/p1", "/studio/projects/p1/extract"],
    );
    assert.deepEqual(
      onDocuments.map((s) => s.current),
      [true, false],
    );
    assert.deepEqual(
      studioSteps("/studio/projects/p1/extract", true).map((s) => s.current),
      [false, true],
    );
    assert.deepEqual(
      studioSteps("/studio/projects/p1/", true).map((s) => s.current),
      [true, false],
    );
  });

  test("no steps outside a project", () => {
    assert.deepEqual(studioSteps("/studio", true), []);
  });

  test("extraction is disabled, with a reason, until the project has documents", () => {
    const [documents, extraction] = studioSteps("/studio/projects/p1", false);
    assert.equal(documents.disabled, false);
    assert.equal(extraction.disabled, true);
    assert.ok(extraction.reason);
    assert.equal(studioSteps("/studio/projects/p1", true)[1].disabled, false);
  });
});
