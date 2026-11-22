import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { projectHref, projectIdFromPath } from "./nav-steps";

describe("studio addresses", () => {
  test("a project has one address, under its id", () => {
    assert.equal(projectHref("p1"), "/studio/projects/p1");
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
